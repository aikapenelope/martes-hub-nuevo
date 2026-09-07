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
  /** Δ% del último mes completo vs el anterior en leads nuevos. */
  leadsNuevosDeltaPct: number | null
  /** Δ% del último mes completo vs el anterior en actividades. */
  actividadesDeltaPct: number | null
}

/** 'YYYY-MM' del mes actual visto desde America/Caracas (mismo criterio que db-aggregates: el SQL agrupa con esa timezone). */
function caracasYearMonth(now = new Date()): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
  }).format(now)
  const [y, m] = parts.split('-').map(Number)
  return { y, m }
}

function lastSixMonthKeys(now = new Date()): string[] {
  // Aritmética de meses en UTC sobre (año, mes de Caracas): tz-independiente.
  const { y, m } = caracasYearMonth(now)
  const keys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
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
    const leadsNuevos = toSeries(leadsRes.rows, 'n')
    const actividades = toSeries(activitiesRes.rows, 'n')

    /** Δ% del último mes completo vs el anterior dentro de una serie de 6 meses. */
    const lastMonthDeltaPct = (series: number[]): number | null => {
      const prev = series[4] ?? 0
      const last = series[5] ?? 0
      return prev > 0 ? ((last - prev) / prev) * 100 : null
    }

    return {
      months,
      cobrado,
      leadsNuevos,
      actividades,
      cobradoDeltaPct: lastMonthDeltaPct(cobrado),
      leadsNuevosDeltaPct: lastMonthDeltaPct(leadsNuevos),
      actividadesDeltaPct: lastMonthDeltaPct(actividades),
    }
  } catch {
    return null
  }
}

export interface WeeklyCashflow {
  /** 'YYYY-MM-DD' del lunes que abre cada semana (8: 7 completas + la actual). */
  weekStarts: string[]
  /** Cobros `pagado` de la semana, agrupados por `paid_at` (instante real). */
  cobrado: number[]
  /** Cobros `pendiente` + `vencido` con vencimiento en la semana, por `due_date`. */
  pendiente: number[]
}

/** Fecha 'YYYY-MM-DD' de hoy vista desde America/Caracas. */
function caracasToday(now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = parts.split('-').map(Number)
  return { y, m, d }
}

/** Lunes (fecha calendario 'YYYY-MM-DD') que abre la semana en curso según Caracas. */
function currentMondayKey(now = new Date()): string {
  const { y, m, d } = caracasToday(now)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  const monday = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7)))
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`
}

/**
 * Serie semanal (8 semanas: 7 completas + la actual) de cobranza para el
 * chart segmentado del Resumen. Dos agregaciones sobre payments:
 * - cobrado: status `pagado` agrupado por semana de `paid_at` (instante real,
 *   truncado en hora de Caracas, mismo criterio que getMonthlyTrends).
 * - pendiente: status `pendiente` + `vencido` agrupado por semana de
 *   `due_date` SIN conversión de zona, igual que monthlyPendingSeries en
 *   db-aggregates: due_date se escribe como fecha calendario a medianoche UTC
 *   y convertir a Caracas correría el vencimiento al día anterior.
 *
 * ⚠️ La clave de semana se formatea SIEMPRE con máscara explícita en el
 * to_char ('YYYY-MM-DD'): date_trunc('week') formateado sin máscara produce
 * claves 'YYYY-DD-MM' con mes/día intercambiados (ronda abortada previa) y
 * las filas no matchearían contra los Mondays calculados en TS.
 */
export async function getWeeklyCashflow({
  payload,
  tenantId,
  user,
}: {
  payload: Payload
  tenantId: number
  user?: User
}): Promise<WeeklyCashflow | null> {
  const db = payload.db as { pool?: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> } }
  if (!db.pool || typeof db.pool.query !== 'function') return null

  // Aritmética de fechas en UTC sobre la fecha de Caracas: tz-independiente.
  const weekStarts: string[] = []
  const [my, mm, md] = currentMondayKey().split('-').map(Number)
  for (let i = 7; i >= 0; i--) {
    const d = new Date(Date.UTC(my, mm - 1, md - i * 7))
    weekStarts.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    )
  }
  const since = weekStarts[0]

  try {
    const [paidRes, pendingRes] = await Promise.all([
      db.pool.query(
        `SELECT to_char(date_trunc('week', paid_at AT TIME ZONE 'America/Caracas'), 'YYYY-MM-DD') AS w,
                COALESCE(SUM(amount), 0)::float8 AS total
         FROM payments
         WHERE tenant_id = $1 AND status::text = 'pagado' AND paid_at >= $2
         GROUP BY 1`,
        [tenantId, `${since}T00:00:00-04:00`],
      ),
      db.pool.query(
        `SELECT to_char(date_trunc('week', due_date), 'YYYY-MM-DD') AS w,
                COALESCE(SUM(amount), 0)::float8 AS total
         FROM payments
         WHERE tenant_id = $1 AND status::text = ANY($2::text[]) AND due_date >= $3
         GROUP BY 1`,
        [tenantId, ['pendiente', 'vencido'], `${since}T00:00:00Z`],
      ),
    ])

    const byWeek = (rows: Array<Record<string, unknown>>): number[] =>
      weekStarts.map((w) => Number(rows.find((r) => r.w === w)?.total ?? 0))

    return {
      weekStarts,
      cobrado: byWeek(paidRes.rows),
      pendiente: byWeek(pendingRes.rows),
    }
  } catch {
    return null
  }
}
