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

export function startOfMonthIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01T00:00:00.000Z`
}

/** Primer día del mes anterior, en UTC ISO — para comparativas mes contra mes. */
export function startOfLastMonthIso(): string {
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const y = lastMonth.getFullYear()
  const m = String(lastMonth.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01T00:00:00.000Z`
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
  // Desde Postgres 8.3 los casts implícitos entre tipos distintos se
  // quitaron — comparar el enum directo contra un array `text[]` vía
  // ANY() puede fallar con "operator does not exist: enum_payments_status
  // = text" según cómo node-postgres infiera el tipo del parámetro. El
  // catch de abajo se traga ese error silenciosamente (devuelve 0), así
  // que sin este cast explícito el agregado podría reportar 0 sin avisar.
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
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const series: MonthlyRevenuePoint[] = Array.from({ length: months }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, total: 0 }
  })

  if (!db.pool || typeof db.pool.query !== 'function') return series

  try {
    const res = await db.pool.query(
      `SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float8 AS total
       FROM payments
       WHERE tenant_id = $1 AND status = 'pagado' AND paid_at >= $2
       GROUP BY 1`,
      [tenantId, start.toISOString()],
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
