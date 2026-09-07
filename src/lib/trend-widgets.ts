import 'server-only'

import type { Payload } from 'payload'
import type { User } from '@/payload-types'

/**
 * Tendencias mensuales (6 meses) para las mini-series del Resumen.
 * Mismo patrón de SQL directo tenant-scoped que db-aggregates: agregaciones
 * que Payload no agrupa por mes sin traer todas las filas a memoria.
 */

export interface MonthlySeries {
  months: string[]
  cobrado: number[]
  leadsNuevos: number[]
  actividades: number[]
  /** Δ% del último mes completo vs el anterior en cobrado. */
  cobradoDeltaPct: number | null
}

function lastSixMonthKeys(now = new Date()): string[] {
  const keys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

export async function getMonthlyTrends({
  payload,
  tenantId,
  user,
}: {
  payload: Payload
  tenantId: number
  user?: User
}): Promise<MonthlySeries | null> {
  const db = payload.db as { pool?: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> } }
  if (!db.pool || typeof db.pool.query !== 'function') return null

  const months = lastSixMonthKeys()
  const since = `${months[0]}-01`

  try {
    const [paidRes, leadsRes, activitiesRes] = await Promise.all([
      db.pool.query(
        `SELECT to_char(date_trunc('month', paid_at AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS m,
                COALESCE(SUM(amount), 0)::float8 AS total
         FROM payments
         WHERE tenant_id = $1 AND status::text = 'pagado' AND paid_at >= $2
         GROUP BY 1`,
        [tenantId, `${since}T00:00:00-04:00`],
      ),
      db.pool.query(
        `SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS m,
                COUNT(*)::int AS n
         FROM leads
         WHERE tenant_id = $1 AND created_at >= $2
         GROUP BY 1`,
        [tenantId, `${since}T00:00:00-04:00`],
      ),
      db.pool.query(
        `SELECT to_char(date_trunc('month', occurred_at AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS m,
                COUNT(*)::int AS n
         FROM activities
         WHERE tenant_id = $1 AND occurred_at >= $2
         GROUP BY 1`,
        [tenantId, `${since}T00:00:00-04:00`],
      ),
    ])

    const toSeries = (rows: Array<Record<string, unknown>>, valueKey: string): number[] =>
      months.map((m) => {
        const row = rows.find((r) => r.m === m)
        return Number(row?.[valueKey] ?? 0)
      })

    const cobrado = toSeries(paidRes.rows, 'total')
    const prev = cobrado[4] ?? 0
    const last = cobrado[5] ?? 0

    return {
      months,
      cobrado,
      leadsNuevos: toSeries(leadsRes.rows, 'n'),
      actividades: toSeries(activitiesRes.rows, 'n'),
      cobradoDeltaPct: prev > 0 ? ((last - prev) / prev) * 100 : null,
    }
  } catch {
    return null
  }
}
