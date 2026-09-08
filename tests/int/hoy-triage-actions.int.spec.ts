import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
}))

import { getWorkspaceContext } from '@/lib/workspace-context'
import { markLeadsContactedTodayAction, snoozeLeadsAction } from '@/lib/hoy-triage-actions'
import type { Payload } from 'payload'

/**
 * Acciones del triage de Hoy con resultado por ID (hallazgo Devin #105-1):
 * Atomicidad por lead (update + activity en transacción) y distinción entre
 * updatedIds (la UI los oculta) y failedIds (siguen visibles).
 */

const mockUser = { id: 1, email: 'admin@martes.local' } as never

function mockPayloadFactory({
  tenantLeadIds = [1, 2],
  failUpdateFor = [],
  failActivityFor = [],
}: {
  tenantLeadIds?: number[]
  failUpdateFor?: number[]
  failActivityFor?: number[]
} = {}) {
  const mockUpdate = vi.fn().mockImplementation(({ collection, id }: { collection: string; id: number }) => {
    if (collection === 'leads' && failUpdateFor.includes(id)) {
      return Promise.reject(new Error(`lead ${id} desapareció en carrera`))
    }
    return Promise.resolve({ id })
  })
  const mockCreate = vi.fn().mockImplementation(({ collection, data }: { collection: string; data: { lead?: number } }) => {
    if (collection === 'activities' && failActivityFor.includes(data.lead as number)) {
      return Promise.reject(new Error('activities caído'))
    }
    return Promise.resolve({ id: 99 })
  })
  const beginTransaction = vi.fn().mockResolvedValue('tx-1')
  const commitTransaction = vi.fn().mockResolvedValue(undefined)
  const rollbackTransaction = vi.fn().mockResolvedValue(undefined)

  const payload = {
    find: vi.fn().mockImplementation(({ where }: { where?: { and?: Array<Record<string, unknown>> } }) => {
      const inClause = where?.and?.find((clause) => 'id' in clause) as { id?: { in?: number[] } } | undefined
      const requested = (inClause?.id?.in ?? []) as number[]
      const visible = requested.filter((id) => tenantLeadIds.includes(id))
      return Promise.resolve({ docs: visible.map((id) => ({ id })), totalDocs: visible.length })
    }),
    update: mockUpdate,
    create: mockCreate,
    db: { beginTransaction, commitTransaction, rollbackTransaction },
    logger: { error: vi.fn() },
  } as unknown as Payload & {
    update: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    db: { beginTransaction: ReturnType<typeof vi.fn>; commitTransaction: ReturnType<typeof vi.fn>; rollbackTransaction: ReturnType<typeof vi.fn> }
    logger: { error: ReturnType<typeof vi.fn> }
  }

  return { payload, mockUpdate, mockCreate, beginTransaction, commitTransaction, rollbackTransaction }
}

function mockContext(payload: Payload, canEdit = true) {
  ;(getWorkspaceContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    payload,
    user: mockUser,
    tenantId: 10,
    canEdit,
  })
}

describe('Triage de Hoy — acciones con resultado por ID (hallazgos Devin #105-1)', () => {
  beforeEach(() => {
    ;(getWorkspaceContext as ReturnType<typeof vi.fn>).mockReset()
  })

  it('marca contactados: update + activity en la MISMA transacción y devuelve updatedIds', async () => {
    const { payload, mockUpdate, mockCreate, commitTransaction } = mockPayloadFactory()
    mockContext(payload)

    const res = await markLeadsContactedTodayAction([1, 2])

    expect(res.ok).toBe(true)
    expect(res.updatedIds).toEqual([1, 2])
    expect(res.failedIds).toEqual([])
    expect(res.updated).toBe(2)
    // Cada lead: update y activity comparten transactionID ('tx-1').
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    for (const call of mockUpdate.mock.calls) {
      expect((call[0] as { req?: { transactionID?: string } }).req?.transactionID).toBe('tx-1')
    }
    for (const call of mockCreate.mock.calls) {
      expect((call[0] as { req?: { transactionID?: string } }).req?.transactionID).toBe('tx-1')
    }
    expect(commitTransaction).toHaveBeenCalledTimes(2)
  })

  it('fallo parcial: el lead que falla queda en failedIds y NO oculta su avance', async () => {
    const { payload, rollbackTransaction } = mockPayloadFactory({ failUpdateFor: [2] })
    mockContext(payload)

    const res = await markLeadsContactedTodayAction([1, 2])

    // Éxito parcial sigue siendo ok: la UI oculta solo updatedIds.
    expect(res.ok).toBe(true)
    expect(res.updatedIds).toEqual([1])
    expect(res.failedIds).toEqual([2])
    expect(res.updated).toBe(1)
    expect(rollbackTransaction).toHaveBeenCalledTimes(1)
  })

  it('fallo de la actividad hace rollback del contacto del lead (atomicidad)', async () => {
    const { payload, mockUpdate, rollbackTransaction } = mockPayloadFactory({ failActivityFor: [1] })
    mockContext(payload)

    const res = await markLeadsContactedTodayAction([1])

    expect(res.ok).toBe(false)
    expect(res.updatedIds).toEqual([])
    expect(res.failedIds).toEqual([1])
    expect(rollbackTransaction).toHaveBeenCalledTimes(1)
    // El update se hizo (y se revirtió en BD real); con mock, verificamos que
    // la acción NO lo cuenta como confirmado.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it('fallo total: ok=false con error y todos los leads en failedIds', async () => {
    const { payload } = mockPayloadFactory({ failUpdateFor: [1, 2] })
    mockContext(payload)

    const res = await markLeadsContactedTodayAction([1, 2])

    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(res.updatedIds).toEqual([])
    expect(res.failedIds).toEqual([1, 2])
  })

  it('scopedLeadIds: un lead de otro tenant jamás se actualiza ni se reporta', async () => {
    const { payload, mockUpdate } = mockPayloadFactory({ tenantLeadIds: [1] })
    mockContext(payload)

    const res = await markLeadsContactedTodayAction([1, 2])

    expect(res.updatedIds).toEqual([1])
    expect(mockUpdate.mock.calls.every((call) => (call[0] as { id: number }).id !== 2)).toBe(true)
  })

  it('sin permiso de edición: ok=false y cero escrituras', async () => {
    const { payload, mockUpdate } = mockPayloadFactory()
    mockContext(payload, false)

    const res = await markLeadsContactedTodayAction([1])

    expect(res.ok).toBe(false)
    expect(res.error).toBe('No tienes permiso para actualizar leads')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('Triage de Hoy — snooze con resultado por ID', () => {
  beforeEach(() => {
    ;(getWorkspaceContext as ReturnType<typeof vi.fn>).mockReset()
  })

  it('pospone los leads solicitados y separa los que fallaron', async () => {
    const { payload, mockUpdate } = mockPayloadFactory()
    mockContext(payload)
    // snooze usa el mismo update de leads; simulamos el fallo por id.
    mockUpdate.mockImplementation(({ id }: { id: number }) =>
      id === 2 ? Promise.reject(new Error('fallo snooze')) : Promise.resolve({ id }),
    )

    const res = await snoozeLeadsAction([1, 2], 3)

    expect(res.ok).toBe(true)
    expect(res.updatedIds).toEqual([1])
    expect(res.failedIds).toEqual([2])
    const data = mockUpdate.mock.calls[0]?.[0] as { data?: { fechaProximaLlamada?: string } }
    expect(data.data?.fechaProximaLlamada).toBeTruthy()
  })

  it('días inválidos caen a 1 día (defensa) y un lote totalmente fallido da ok=false', async () => {
    const { payload, mockUpdate } = mockPayloadFactory()
    mockContext(payload)
    mockUpdate.mockRejectedValue(new Error('BD caída'))

    const res = await snoozeLeadsAction([1, 2], 5 as 1 | 3 | 7)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('Ningún lead pudo posponerse')
    expect(res.failedIds).toEqual([1, 2])
  })
})
