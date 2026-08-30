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
