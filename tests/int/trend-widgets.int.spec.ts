import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { getMonthlyTrends, type MonthlySeries } from '@/lib/trend-widgets'
import { zonedTimeToUtc } from '@/lib/overview-data'

const mockUser = {
  id: 1,
  collection: 'users',
  email: 'admin@martes.local',
  roles: ['admin'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as User

describe('trend-widgets — getMonthlyTrends (deltas mensuales)', () => {
  /** Mismos 6 keys 'YYYY-MM' que lastSixMonthKeys para una tz dada. */
  function sixMonthKeys(timeZone: string, now = new Date()): string[] {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    }).format(now)
    const [y, m] = parts.split('-').map(Number)
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1))
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }
    return keys
  }

  /**
   * Serie de 6 meses donde el último (índice 5) es el mes PARCIAL en curso.
   * `timezone` en company-settings controla las claves que debe usar la lib.
   */
  function mockPayloadWithSeries(
    cobrado: number[],
    leadsNuevos: number[],
    actividades: number[],
    { timezone }: { timezone?: string } = {},
  ): Payload {
    const keys = sixMonthKeys(timezone ?? 'America/Caracas')
    const toRows = (series: number[], valueKey: string) =>
      keys.map((m, i) => ({ m, [valueKey]: series[i] }))
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: toRows(cobrado, 'total') })
      .mockResolvedValueOnce({ rows: toRows(leadsNuevos, 'n') })
      .mockResolvedValueOnce({ rows: toRows(actividades, 'n') })
    const find = vi.fn().mockResolvedValue({ docs: timezone ? [{ timezone }] : [] })
    return {
      find,
      db: { pool: { query } },
    } as unknown as Payload
  }

  it('compara los dos últimos meses COMPLETOS e ignora el mes parcial en curso', async () => {
    const payload = mockPayloadWithSeries(
      [10, 10, 10, 10, 50, 3], // mes parcial = 3 — NO debe participar en el delta
      [5, 5, 5, 5, 8, 0], // mes parcial = 0 — tampoco
      [0, 0, 0, 0, 0, 0],
    )

    const trends = await getMonthlyTrends({ payload, tenantId: 10, user: mockUser, })

    expect(trends).not.toBeNull()
    // meses[3]=10 vs meses[4]=50 → +400% (sin el fix sería el parcial 3 vs 50 → -94%)
    expect(trends?.cobradoDeltaPct).toBe(400)
    // meses[3]=5 vs meses[4]=8 → +60%
    expect(trends?.leadsNuevosDeltaPct).toBe(60)
    // sin base de comparación (prev = 0) → null, nunca Infinity
    expect(trends?.actividadesDeltaPct).toBeNull()
  })

  it('resuelve la zona horaria del tenant con RLS y la pasa como parámetro del SQL', async () => {
    const timezone = 'America/Bogota'
    const payload = mockPayloadWithSeries(
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      { timezone },
    )
    const find = (payload as unknown as { find: ReturnType<typeof vi.fn> }).find
    const query = (payload as unknown as { db: { pool: { query: ReturnType<typeof vi.fn> } } }).db.pool.query

    const trends: MonthlySeries | null = await getMonthlyTrends({
      payload,
      tenantId: 10,
      user: mockUser,
    })

    expect(trends).not.toBeNull()
    // RLS en la lectura de company-settings
    const findParams = find.mock.calls[0][0] as { overrideAccess: boolean; user: unknown; where: unknown }
    expect(findParams.overrideAccess).toBe(false)
    expect(findParams.user).toEqual(mockUser)
    expect(findParams.where).toBeDefined()

    // El tz del tenant viaja como PARÁMETRO (nunca interpolado) y el límite
    // inferior es la medianoche local del primer mes convertida a UTC —
    // eventos alrededor del límite UTC de mes agrupan en el mes del tenant.
    const keys = sixMonthKeys(timezone)
    const expectedSince = zonedTimeToUtc(`${keys[0]}-01T00:00:00`, timezone).toISOString()
    const params = query.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe(timezone)
    expect(params[2]).toBe(expectedSince)
  })

  it('devuelve null cuando falta el pool SQL (drivers sin acceso directo)', async () => {
    const payload = { db: { pool: undefined } } as unknown as Payload
    const trends = await getMonthlyTrends({ payload, tenantId: 10 })
    expect(trends).toBeNull()
  })
})

