import type { Payload } from 'payload'

export interface PaymentAggregate {
  total: number
  count: number
}

interface PoolLike {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<{ total?: string | number | null; count?: string | number | null }> }>
}

// El negocio opera en Caracas: VET es UTC-4 fijo (sin DST desde 2016 — mismo
// supuesto que caracasDayRange en paymentReminders). Sin esto, los cobros de
// 20:00–23:59 VET del último día del mes se contaban en el mes equivocado.
const CARACAS_TZ = 'America/Caracas'
const CARACAS_OFFSET = '-04:00'

/** 'YYYY-MM' del mes actual visto desde America/Caracas. */
function caracasYearMonth(offsetMonths = 0): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
  const [y, m] = parts.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1 + offsetMonths, 1))
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1 }
}

/** Inicio del mes (de Caracas) como instante ISO con su offset real. */
function caracasMonthStartIso(offsetMonths = 0): string {
  const { y, m } = caracasYearMonth(offsetMonths)
  const mm = String(m).padStart(2, '0')
  return `${y}-${mm}-01T00:00:00${CARACAS_OFFSET}`
}

export function startOfMonthIso(): string {
  return caracasMonthStartIso(0)
}

/** Primer día del mes anterior (en hora de Caracas) — para comparativas mes contra mes. */
export function startOfLastMonthIso(): string {
  return caracasMonthStartIso(-1)
}

/**
 * Suma agregada de pagos por tenant usando SQL directo sobre el pool de
 * Postgres (en lugar de traer todas las filas a memoria). Devuelve 0 cuando
 * el adaptador no expone pool o ante cualquier fallo de la consulta.
 */
export async function paymentsAggregate(
  payload: Payload,
  tenantId: number,
  statuses: string[],
  paidAfter?: string,
  paidBefore?: string,
): Promise<PaymentAggregate> {
  const db = payload.db as { pool?: PoolLike }
  if (!db.pool || typeof db.pool.query !== 'function' || statuses.length === 0) {
    return { total: 0, count: 0 }
  }

  const params: unknown[] = [tenantId, statuses]
  // `status` es un ENUM nativo de Postgres (enum_payments_status), no texto.
  // Comparar con status::text = ANY($2::text[]) para evitar error de tipos en node-postgres.
  let where = 'tenant_id = $1 AND status::text = ANY($2::text[])'
  if (paidAfter) {
    params.push(paidAfter)
    where += ` AND paid_at >= $${params.length}`
  }
  if (paidBefore) {
    params.push(paidBefore)
    where += ` AND paid_at < $${params.length}`
  }

  try {
    const res = await db.pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float8 AS total, COUNT(*) AS count FROM payments WHERE ${where}`,
      params,
    )
    const row = res.rows[0]
    return {
      total: Number(row?.total ?? 0),
      count: Number(row?.count ?? 0),
    }
  } catch {
    return { total: 0, count: 0 }
  }
}

export interface QuoteAggregate {
  total: number
  count: number
}

/**
 * Suma agregada de cotizaciones activas por tenant usando SQL directo sobre Postgres.
 */
export async function quotesAggregate(
  payload: Payload,
  tenantId: number,
  statuses: string[],
): Promise<QuoteAggregate> {
  const db = payload.db as { pool?: PoolLike }
  if (!db.pool || typeof db.pool.query !== 'function' || statuses.length === 0) {
    return { total: 0, count: 0 }
  }

  const params: unknown[] = [tenantId, statuses]
  const where = 'tenant_id = $1 AND status::text = ANY($2::text[])'

  try {
    const res = await db.pool.query(
      `SELECT COALESCE(SUM(total), 0)::float8 AS total, COUNT(*) AS count FROM quotes WHERE ${where}`,
      params,
    )
    const row = res.rows[0]
    return {
      total: Number(row?.total ?? 0),
      count: Number(row?.count ?? 0),
    }
  } catch {
    return { total: 0, count: 0 }
  }
}

export interface MonthlyPendingPoint {
  month: string // 'YYYY-MM'
  total: number
}

/**
 * Serie mensual de cobros pendientes (status `pendiente` + `vencido`) de los
 * últimos `months` meses, agregada con `date_trunc` directo sobre el pool y
 * agrupada por `due_date` (cuando se espera el dinero, no cuando se registró).
 * Complementa a monthlyRevenueSeries para el flujo de caja del cockpit.
 */
export async function monthlyPendingSeries(
  payload: Payload,
  tenantId: number,
  months: number,
): Promise<MonthlyPendingPoint[]> {
  const db = payload.db as { pool?: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ month: string; total: string | number }> }> } }
  // La serie se etiqueta y agrupa en hora de Caracas (no en la TZ del server)
  const { y: nowY, m: nowM } = caracasYearMonth()
  const start = new Date(Date.UTC(nowY, nowM - 1 - (months - 1), 1))

  const series: MonthlyPendingPoint[] = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, total: 0 }
  })

  if (!db.pool || typeof db.pool.query !== 'function') return series

  try {
    const res = await db.pool.query(
      `SELECT to_char(date_trunc('month', due_date AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float8 AS total
       FROM payments
       WHERE tenant_id = $1 AND status::text = ANY($2::text[]) AND due_date >= $3
       GROUP BY 1`,
      [tenantId, ['pendiente', 'vencido'], caracasMonthStartIso(-(months - 1))],
    )
    const byMonth = new Map(res.rows.map((r) => [r.month, Number(r.total)]))
    for (const point of series) {
      const value = byMonth.get(point.month)
      if (value !== undefined) point.total = value
    }
  } catch {
    // deja la serie en 0 — mejor un chart plano que uno con datos a medias
  }

  return series
}

export interface MonthlyRevenuePoint {
  month: string // 'YYYY-MM'
  total: number
}

/**
 * Serie mensual de pagos `pagado` de los últimos `months` meses (incluye el
 * actual), agregada con `date_trunc` directo sobre el pool — evita traer
 * todas las filas a memoria. Meses sin pagos aparecen con total 0 (nunca se
 * omiten ni se rellenan con un valor inventado).
 */
export async function monthlyRevenueSeries(
  payload: Payload,
  tenantId: number,
  months: number,
): Promise<MonthlyRevenuePoint[]> {
  const db = payload.db as { pool?: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ month: string; total: string | number }> }> } }
  // La serie se etiqueta y agrupa en hora de Caracas (no en la TZ del server)
  const { y: nowY, m: nowM } = caracasYearMonth()
  const start = new Date(Date.UTC(nowY, nowM - 1 - (months - 1), 1))

  const series: MonthlyRevenuePoint[] = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, total: 0 }
  })

  if (!db.pool || typeof db.pool.query !== 'function') return series

  try {
    const res = await db.pool.query(
      `SELECT to_char(date_trunc('month', paid_at AT TIME ZONE 'America/Caracas'), 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float8 AS total
       FROM payments
       WHERE tenant_id = $1 AND status = 'pagado' AND paid_at >= $2
       GROUP BY 1`,
      [tenantId, caracasMonthStartIso(-(months - 1))],
    )
    const byMonth = new Map(res.rows.map((r) => [r.month, Number(r.total)]))
    for (const point of series) {
      const value = byMonth.get(point.month)
      if (value !== undefined) point.total = value
    }
  } catch {
    // deja la serie en 0 — mejor un chart plano que uno con datos a medias
  }

  return series
}
