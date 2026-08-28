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

import { paymentsAggregate, startOfMonthIso, type PaymentAggregate } from './db-aggregates'
export { paymentsAggregate, startOfMonthIso, type PaymentAggregate }

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