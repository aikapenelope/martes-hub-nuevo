import 'server-only'

import type { Payload, Where } from 'payload'
import type { Task, User } from '@/payload-types'

interface OverviewOptions {
  payload: Payload
  user: User
  tenantId: number
}

const tenantWhere = (tenantId: number, extra?: Where): Where => ({
  and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
})

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
): Promise<PaymentAggregate> {
  const db = payload.db as { pool?: PoolLike }
  if (!db.pool || typeof db.pool.query !== 'function' || statuses.length === 0) {
    return { total: 0, count: 0 }
  }

  const params: unknown[] = [tenantId, statuses]
  let where = 'tenant_id = $1 AND status = ANY($2::text[])'
  if (paidAfter) {
    params.push(paidAfter)
    where += ` AND paid_at >= $${params.length}`
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
  } catch (err) {
    payload.logger.error({
      msg: 'paymentsAggregate falló',
      err: err instanceof Error ? err.message : err,
    })
    return { total: 0, count: 0 }
  }
}

/** Inicio del mes actual (UTC) para el KPI "cobrado este mes". */
export function startOfMonthIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function getOverviewData({ payload, user, tenantId }: OverviewOptions) {
  const now = new Date()
  const startOfMonth = startOfMonthIso()
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  const [clients, leads, newLeads, pendingTasks, urgentTasks, conversations, staleConversations, paidAggregate, duePayments, recentTasks] = await Promise.all([
    query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, { stage: { equals: 'activo' } }) }),
    query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, { status: { not_equals: 'descartado' } }) }),
    query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, { createdAt: { greater_than_equal: sevenDaysAgo } }) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, { and: [{ priority: { in: ['alta', 'urgente'] } }, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }] }) }),
    query({ collection: 'conversations', limit: 0, where: tenantWhere(tenantId) }),
    query({ collection: 'conversations', limit: 0, where: tenantWhere(tenantId, { lastInboundAt: { less_than_equal: fourHoursAgo } }) }),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonth),
    query({ collection: 'payments', limit: 0, where: tenantWhere(tenantId, { status: { in: ['pendiente', 'vencido'] } }) }),
    query({ collection: 'tasks', limit: 5, depth: 1, sort: 'dueDate', where: tenantWhere(tenantId, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }) }),
  ])

  return {
    kpis: {
      activeClients: clients.totalDocs,
      openLeads: leads.totalDocs,
      newLeads: newLeads.totalDocs,
      pendingTasks: pendingTasks.totalDocs,
      urgentTasks: urgentTasks.totalDocs,
      conversations: conversations.totalDocs,
      staleConversations: staleConversations.totalDocs,
      collected: paidAggregate.total,
      duePayments: duePayments.totalDocs,
    },
    tasks: recentTasks.docs as Task[],
  }
}