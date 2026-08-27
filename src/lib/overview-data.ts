import 'server-only'

import type { Payload, Where } from 'payload'
import type { Payment, Task, User } from '@/payload-types'

interface OverviewOptions {
  payload: Payload
  user: User
  tenantId: number
}

const tenantWhere = (tenantId: number, extra?: Where): Where => ({
  and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
})

export async function getOverviewData({ payload, user, tenantId }: OverviewOptions) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  const [clients, leads, newLeads, pendingTasks, urgentTasks, conversations, staleConversations, paidPayments, duePayments, recentTasks] = await Promise.all([
    query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, { stage: { equals: 'activo' } }) }),
    query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, { status: { not_equals: 'descartado' } }) }),
    query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, { createdAt: { greater_than_equal: sevenDaysAgo } }) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, { and: [{ priority: { in: ['alta', 'urgente'] } }, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }] }) }),
    query({ collection: 'conversations', limit: 0, where: tenantWhere(tenantId) }),
    query({ collection: 'conversations', limit: 0, where: tenantWhere(tenantId, { lastInboundAt: { less_than_equal: fourHoursAgo } }) }),
    query({ collection: 'payments', limit: 1000, pagination: false, where: tenantWhere(tenantId, { and: [{ status: { equals: 'pagado' } }, { paidAt: { greater_than_equal: startOfMonth } }] }) }),
    query({ collection: 'payments', limit: 0, where: tenantWhere(tenantId, { status: { in: ['pendiente', 'vencido'] } }) }),
    query({ collection: 'tasks', limit: 5, depth: 1, sort: 'dueDate', where: tenantWhere(tenantId, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }) }),
  ])

  const payments = paidPayments.docs as Payment[]
  const collected = payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)

  return {
    kpis: {
      activeClients: clients.totalDocs,
      openLeads: leads.totalDocs,
      newLeads: newLeads.totalDocs,
      pendingTasks: pendingTasks.totalDocs,
      urgentTasks: urgentTasks.totalDocs,
      conversations: conversations.totalDocs,
      staleConversations: staleConversations.totalDocs,
      collected,
      duePayments: duePayments.totalDocs,
    },
    tasks: recentTasks.docs as Task[],
  }
}
