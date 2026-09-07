import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { getMonthlyTrends } from '@/lib/trend-widgets'

describe('trend-widgets — getMonthlyTrends (deltas mensuales)', () => {
  /** Mismos 6 keys 'YYYY-MM' que lastSixMonthKeys (mes actual de Caracas, 5 hacia atrás). */
  function sixMonthKeys(now = new Date()): string[] {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
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

  /** Serie de 6 meses donde el último (índice 5) es el mes PARCIAL en curso. */
  function mockPayloadWithSeries(cobrado: number[], leadsNuevos: number[], actividades: number[]): Payload {
    const months = sixMonthKeys()
    const toRows = (series: number[], valueKey: string) =>
      months.map((m, i) => ({ m, [valueKey]: series[i] }))
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: toRows(cobrado, 'total') })
      .mockResolvedValueOnce({ rows: toRows(leadsNuevos, 'n') })
      .mockResolvedValueOnce({ rows: toRows(actividades, 'n') })
    return {
      db: { pool: { query } },
    } as unknown as Payload
  }

  it('compara los dos últimos meses COMPLETOS e ignora el mes parcial en curso', async () => {
    const payload = mockPayloadWithSeries(
      [10, 10, 10, 10, 50, 3], // mes parcial = 3 — NO debe participar en el delta
      [5, 5, 5, 5, 8, 0], // mes parcial = 0 — tampoco
      [0, 0, 0, 0, 0, 0],
    )

    const trends = await getMonthlyTrends({ payload, tenantId: 10 })

    expect(trends).not.toBeNull()
    // meses[3]=10 vs meses[4]=50 → +400% (sin el fix sería el parcial 3 vs 50 → -94%)
    expect(trends?.cobradoDeltaPct).toBe(400)
    // meses[3]=5 vs meses[4]=8 → +60%
    expect(trends?.leadsNuevosDeltaPct).toBe(60)
    // sin base de comparación (prev = 0) → null, nunca Infinity
    expect(trends?.actividadesDeltaPct).toBeNull()
  })

  it('devuelve null cuando falta el pool SQL (drivers sin acceso directo)', async () => {
    const payload = { db: { pool: undefined } } as unknown as Payload
    const trends = await getMonthlyTrends({ payload, tenantId: 10 })
    expect(trends).toBeNull()
  })
})
