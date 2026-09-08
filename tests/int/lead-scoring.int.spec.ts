import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { computeLeadScore, scoreTenantLeads } from '@/lib/lead-scoring'
import { recalculateLeadScoresTask } from '@/jobs/leadScoring'

const NOW = Date.parse('2026-09-08T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const daysAgoIso = (days: number): string => new Date(NOW - days * DAY_MS).toISOString()

describe('computeLeadScore — fórmula de scoring', () => {
  it('lead con inbound reciente, sentimiento positivo, llamadas y decisor → caliente/alta', () => {
    const result = computeLeadScore(
      {
        status: 'contactado',
        createdAt: daysAgoIso(10),
        lastInboundAt: daysAgoIso(0.1),
        lastMessageAt: daysAgoIso(0.1),
        numeroDeLlamadas: 2,
        pudoHablarDecisor: true,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 30 (inbound ≤24h) + 25 (positivo) + 10 (2 llamadas) + 10 (decisor) + 10 (etapa)
    expect(result.score).toBe(85)
    expect(result.nivelInteres).toBe('caliente')
    expect(result.prioridad).toBe('alta')
  })

  it('sentimiento positivo sin inbound y sin llamadas → templado/baja', () => {
    const result = computeLeadScore(
      {
        status: 'contactado',
        createdAt: daysAgoIso(5),
        lastInboundAt: null,
        lastMessageAt: daysAgoIso(3.5),
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 25 (positivo) + 10 (etapa); SLA: 3 días desde último mensaje, sin exceso
    expect(result.score).toBe(35)
    expect(result.nivelInteres).toBe('templado')
    expect(result.prioridad).toBe('baja')
  })

  it('lead nuevo sin señales → frio/baja', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(0.2),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(result.score).toBe(5)
    expect(result.nivelInteres).toBe('frio')
    expect(result.prioridad).toBe('baja')
  })

  it('SLA vencido penaliza −10 por cada 2 días de exceso y el score no baja de 0', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(8),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    // 5 (nuevo) − 10·⌊(8−2)/2⌋ = 5 − 30 → piso 0
    expect(result.score).toBe(0)
    expect(result.nivelInteres).toBe('frio')
    expect(result.prioridad).toBe('baja')
  })

  it('sentimiento en_riesgo resta puntos', () => {
    const result = computeLeadScore(
      {
        status: 'calificado',
        createdAt: daysAgoIso(2),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'en_riesgo',
      },
      NOW,
    )
    // −15 (en_riesgo) + 15 (calificado, dentro de SLA de 7 días)
    expect(result.score).toBe(0)
    expect(result.nivelInteres).toBe('frio')
  })

  it('frontera exacta de caliente en 60 → caliente/media', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(0),
        lastInboundAt: daysAgoIso(0.5),
        lastMessageAt: daysAgoIso(0.5),
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 30 (inbound) + 25 (positivo) + 5 (nuevo)
    expect(result.score).toBe(60)
    expect(result.nivelInteres).toBe('caliente')
    expect(result.prioridad).toBe('media')
  })

  it('llamadas negativas se tratan como cero y 4+ saturan en +15', () => {
    const bajo = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(1),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: -2,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(bajo.score).toBe(5)

    const saturado = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(1),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 9,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(saturado.score).toBe(20)
  })
})

interface TenantLeadsMocks {
  payload: Payload
  update: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  queue: ReturnType<typeof vi.fn>
}

function buildMockPayload(lead: Record<string, unknown>, extras?: {
  conversations?: Record<string, unknown>[]
  summaries?: Record<string, unknown>[]
}): TenantLeadsMocks {
  const update = vi.fn().mockResolvedValue({})
  const create = vi.fn().mockResolvedValue({})
  const queue = vi.fn().mockResolvedValue({})
  const find = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
    if (collection === 'conversations') {
      return Promise.resolve({ docs: extras?.conversations ?? [], hasNextPage: false })
    }
    if (collection === 'conversation-summaries') {
      return Promise.resolve({ docs: extras?.summaries ?? [], hasNextPage: false })
    }
    if (collection === 'leads') {
      return Promise.resolve({ docs: [lead], hasNextPage: false })
    }
    return Promise.resolve({ docs: [], hasNextPage: false })
  })
  const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
  const payload = {
    find,
    update,
    create,
    count,
    jobs: { queue },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Payload
  return { payload, update, create, queue }
}

describe('scoreTenantLeads — barrido tenant-scoped', () => {
  it('escribe el recálculo y dispara hot-lead al promover a caliente', async () => {
    const lead = {
      id: 7,
      fullName: 'Ana Pérez',
      status: 'nuevo',
      createdAt: daysAgoIso(1),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'frio',
      prioridad: 'baja',
      assignedTo: 3,
    }
    const mocks = buildMockPayload(lead, {
      conversations: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }],
      summaries: [{ lead: 7, sentiment: 'positivo' }],
    })

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1 })

    // 30 (inbound) + 25 (positivo) + 5 (nuevo) = 60 → caliente/media
    expect(res).toEqual({ scored: 1, updated: 1, promoted: 1 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        id: 7,
        data: { nivelInteres: 'caliente', prioridad: 'media' },
      }),
    )
    // Automatización hot-lead: brief IA encolado + tarea recordatorio asignada al agente
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'generate-lead-brief', input: { leadId: 7, tenantId: 1 } }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tasks',
        data: expect.objectContaining({ source: 'lead_hot', assignedTo: 3, priority: 'alta' }),
      }),
    )
  })

  it('no escribe ni dispara automatización cuando el scoring no cambia', async () => {
    const lead = {
      id: 8,
      fullName: 'Beto Ruiz',
      status: 'nuevo',
      createdAt: daysAgoIso(0.2),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'frio',
      prioridad: 'baja',
      assignedTo: null,
    }
    const mocks = buildMockPayload(lead)

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1 })

    expect(res).toEqual({ scored: 1, updated: 0, promoted: 0 })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
  })

  it('degrada un caliente sin actividad (recálculo bidireccional) sin disparar hot-lead', async () => {
    const lead = {
      id: 9,
      fullName: 'Carla Díaz',
      status: 'contactado',
      createdAt: daysAgoIso(10),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'caliente',
      prioridad: 'alta',
      assignedTo: 4,
    }
    const mocks = buildMockPayload(lead)

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1 })

    // 10 (contactado) − 10·⌊(10−3)/2⌋ = 10 − 30 → piso 0
    expect(res).toEqual({ scored: 1, updated: 1, promoted: 0 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        id: 9,
        data: { nivelInteres: 'frio', prioridad: 'baja' },
      }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
  })
})

describe('recalculate-lead-scores — handler del job', () => {
  it('itera tenants y agrega totales en el output', async () => {
    const lead = {
      id: 7,
      fullName: 'Ana Pérez',
      status: 'nuevo',
      createdAt: daysAgoIso(1),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'frio',
      prioridad: 'baja',
      assignedTo: 3,
    }
    const mocks = buildMockPayload(lead, {
      conversations: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }],
      summaries: [{ lead: 7, sentiment: 'positivo' }],
    })
    const findMock = mocks.payload.find as unknown as ReturnType<typeof vi.fn>
    const originalImpl = findMock.getMockImplementation() as
      | ((opts: { collection: string }) => Promise<unknown>)
      | undefined
    findMock.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'tenants') {
        return Promise.resolve({ docs: [{ id: 1, name: 'Tenant Alpha' }], hasNextPage: false })
      }
      return originalImpl?.({ collection })
    })

    if (typeof recalculateLeadScoresTask.handler !== 'function') {
      throw new Error('recalculateLeadScoresTask.handler must be a function')
    }
    type TaskArgs = Parameters<
      Extract<typeof recalculateLeadScoresTask.handler, (...args: never[]) => unknown>
    >[0]
    const result = (await recalculateLeadScoresTask.handler({
      req: { payload: mocks.payload },
    } as unknown as TaskArgs)) as {
      output: { scored: number; updated: number; promoted: number; summary: string }
    }

    expect(result.output).toMatchObject({ scored: 1, updated: 1, promoted: 1 })
    expect(result.output.summary).toContain('Evaluados: 1')
  })
})
