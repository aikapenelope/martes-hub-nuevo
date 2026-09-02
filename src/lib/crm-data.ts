import 'server-only'

import type { Payload, Where } from 'payload'
import type { Activity, Appointment, Client, Conversation, EmailLog, EmailMessage, FormSubmission, Lead, Message, Payment, Task, User } from '@/payload-types'
import {
  CLIENT_STAGES,
  LEAD_STATUSES,
  type ClientStage,
  type CrmFilters,
  type CrmView,
  type LeadStatus,
} from '@/lib/crm-filters'

const PAGE_SIZE = 20

export type { ClientStage, CrmFilters, CrmMode, CrmSearchParams, CrmView, LeadStatus } from '@/lib/crm-filters'
export { CLIENT_STAGES, CRM_MODES, CRM_VIEWS, LEAD_STATUSES, parseCrmFilters } from '@/lib/crm-filters'

function tenantWhere(tenantId: number, extra: Where[]): Where {
  return { and: [{ tenant: { equals: tenantId } }, ...extra] }
}

function leadSearchWhere(query: string): Where[] {
  if (!query) return []
  return [
    {
      or: [
        { fullName: { like: query } },
        { email: { like: query } },
        { phone: { like: query } },
      ],
    },
  ]
}

function clientSearchWhere(query: string): Where[] {
  if (!query) return []
  return [
    {
      or: [
        { name: { like: query } },
        { email: { like: query } },
        { phone: { like: query } },
      ],
    },
  ]
}

export interface CrmDataOptions {
  payload: Payload
  user: User
  tenantId: number
  filters: CrmFilters
}

export interface CrmPagination {
  page: number
  totalPages: number
  totalDocs: number
  hasPrevPage: boolean
  hasNextPage: boolean
}

export interface CrmData {
  view: CrmView
  pipeline: { status: LeadStatus; total: number }[]
  stages: { stage: ClientStage; total: number }[]
  leads: Lead[]
  clients: Client[]
  pagination: CrmPagination
  totals: { leads: number; clients: number }
}

/**
 * Contrato agregado de CRM: pipeline + tabla paginada del tenant activo.
 * Cada consulta lleva user, overrideAccess:false, tenant, limit y select.
 */
export async function getCrmData({ payload, user, tenantId, filters }: CrmDataOptions): Promise<CrmData> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  if (filters.view === 'clientes') {
    const stageFilter: Where[] =
      filters.stage === 'todos' ? [] : [{ stage: { equals: filters.stage } }]

    const [clientsResult, leadsCount, ...stageCounts] = await Promise.all([
      query({
        collection: 'clients',
        depth: 1,
        limit: PAGE_SIZE,
        page: filters.page,
        sort: '-updatedAt',
        where: tenantWhere(tenantId, [...stageFilter, ...clientSearchWhere(filters.query)]),
        select: {
          name: true,
          stage: true,
          email: true,
          phone: true,
          segment: true,
          assignedAgent: true,
          optOutAt: true,
          updatedAt: true,
        },
      }),
      query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, [{ status: { not_equals: 'descartado' } }]) }),
      ...CLIENT_STAGES.map((stage) =>
        query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, [{ stage: { equals: stage } }]) }),
      ),
    ])

    return {
      view: 'clientes',
      pipeline: [],
      stages: CLIENT_STAGES.map((stage, index) => ({ stage, total: stageCounts[index].totalDocs })),
      leads: [],
      clients: clientsResult.docs as Client[],
      pagination: {
        page: clientsResult.page ?? 1,
        totalPages: clientsResult.totalPages ?? 1,
        totalDocs: clientsResult.totalDocs ?? 0,
        hasPrevPage: clientsResult.hasPrevPage ?? false,
        hasNextPage: clientsResult.hasNextPage ?? false,
      },
      totals: { leads: leadsCount.totalDocs, clients: stageCounts.reduce((sum, r) => sum + r.totalDocs, 0) },
    }
  }

  const statusFilter: Where[] =
    filters.status === 'todos' ? [] : [{ status: { equals: filters.status } }]

  const [leadsResult, clientsCount, ...pipelineCounts] = await Promise.all([
    query({
      collection: 'leads',
      depth: 1,
      limit: PAGE_SIZE,
      page: filters.page,
      sort: '-createdAt',
      where: tenantWhere(tenantId, [...statusFilter, ...leadSearchWhere(filters.query)]),
      select: {
        fullName: true,
        status: true,
        source: true,
        email: true,
        phone: true,
        segment: true,
        convertedClient: true,
        createdAt: true,
      },
    }),
    query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, [{ stage: { equals: 'activo' } }]) }),
    ...LEAD_STATUSES.map((status) =>
      query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, [{ status: { equals: status } }]) }),
    ),
  ])

  return {
    view: 'leads',
    pipeline: LEAD_STATUSES.map((status, index) => ({ status, total: pipelineCounts[index].totalDocs })),
    stages: [],
    leads: leadsResult.docs as Lead[],
    clients: [],
    pagination: {
      page: leadsResult.page ?? 1,
      totalPages: leadsResult.totalPages ?? 1,
      totalDocs: leadsResult.totalDocs ?? 0,
      hasPrevPage: leadsResult.hasPrevPage ?? false,
      hasNextPage: leadsResult.hasNextPage ?? false,
    },
    totals: { leads: pipelineCounts.reduce((sum, r) => sum + r.totalDocs, 0), clients: clientsCount.totalDocs },
  }
}

export interface TimelineEntry {
  kind: 'actividad' | 'conversacion' | 'email_buzon' | 'email_enviado' | 'cita' | 'tarea' | 'cobro' | 'formulario'
  date: string
  title: string
  detail: string | null
  href: string | null
  direction: 'in' | 'out' | 'neutral'
}

export interface CrmConversationRef {
  id: number
  channel: Conversation['channel']
  status: Conversation['status']
  contactAddress: string
  lastMessageAt: string | null
}

export interface CrmRecordDetail {
  type: CrmView
  lead?: Lead
  client?: Client
  activities: Activity[]
  /** Timeline unificado: actividades + conversaciones + emails + citas + tareas + cobros + formularios. */
  timeline: TimelineEntry[]
  /** Conversaciones del registro para deep link al inbox (/workspace/inbox?c=id). */
  conversations: CrmConversationRef[]
}

const CHANNEL_LABEL: Record<NonNullable<Conversation['channel']>, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram DM',
  whatsapp_web: 'WhatsApp Web',
}

const CONV_STATUS_LABEL: Record<NonNullable<Conversation['status']>, string> = {
  open: 'abierta',
  pending: 'pendiente',
  resolved: 'resuelta',
}

function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Ficha 360 de un lead o cliente. Timeline unificado: todo lo comunicacional
 * y comercial del registro ordenado por fecha — conversaciones (con preview
 * del último mensaje y deep link al inbox), emails espejados del buzón,
 * emails enviados desde el CRM, citas espejadas de GCal, tareas, cobros y
 * formularios. Todo dentro del tenant.
 */
export async function getCrmRecord({
  payload,
  user,
  tenantId,
  type,
  id,
}: {
  payload: Payload
  user: User
  tenantId: number
  type: CrmView
  id: number
}): Promise<CrmRecordDetail | null> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  const isLead = type === 'leads'

  const recordRes = await query({
    collection: isLead ? 'leads' : 'clients',
    depth: 1,
    limit: 1,
    where: tenantWhere(tenantId, [{ id: { equals: id } }]),
  })
  const record = recordRes.docs[0] as Lead | Client | undefined
  if (!record) return null

  const recordWhere = tenantWhere(tenantId, [isLead ? { lead: { equals: id } } : { client: { equals: id } }])

  const [activitiesRes, conversationsRes, emailMessagesRes, emailLogRes, appointmentsRes, tasksRes, formsRes, paymentsRes] =
    await Promise.all([
      query({ collection: 'activities', depth: 1, limit: 25, sort: '-occurredAt', where: recordWhere }),
      query({ collection: 'conversations', depth: 0, limit: 10, sort: '-lastMessageAt', where: recordWhere }),
      query({ collection: 'email-messages', depth: 0, limit: 15, sort: '-date', where: recordWhere }),
      query({ collection: 'email-log', depth: 0, limit: 15, sort: '-createdAt', where: recordWhere }),
      query({ collection: 'appointments', depth: 0, limit: 10, sort: '-start', where: recordWhere }),
      query({ collection: 'tasks', depth: 0, limit: 10, sort: '-dueDate', where: recordWhere }),
      query({ collection: 'form-submissions', depth: 0, limit: 10, sort: '-createdAt', where: recordWhere }),
      // Los cobros solo cuelgan de clientes (payments.client es required).
      isLead
        ? Promise.resolve({ docs: [] })
        : query({ collection: 'payments', depth: 0, limit: 10, sort: '-dueDate', where: recordWhere }),
    ])

  const conversations = conversationsRes.docs as Conversation[]
  const conversationIds = conversations.map((c) => c.id)

  // Último mensaje por conversación para el preview del timeline ("qué dijeron").
  const latestByConv = new Map<number, { text: string; direction: Message['direction']; count: number }>()
  if (conversationIds.length > 0) {
    const messagesRes = await query({
      collection: 'messages',
      depth: 0,
      limit: 60,
      sort: '-sentAt',
      where: tenantWhere(tenantId, [{ conversation: { in: conversationIds } }]),
    })
    for (const msg of messagesRes.docs as Message[]) {
      const convId = typeof msg.conversation === 'object' ? msg.conversation.id : msg.conversation
      const prev = latestByConv.get(convId)
      if (prev) {
        prev.count += 1
      } else {
        latestByConv.set(convId, { text: msg.text ?? '(sin texto)', direction: msg.direction, count: 1 })
      }
    }
  }

  const entries: TimelineEntry[] = []

  for (const activity of activitiesRes.docs as Activity[]) {
    entries.push({
      kind: 'actividad',
      date: activity.occurredAt,
      title: activity.summary,
      detail: activity.type,
      href: null,
      direction: 'neutral',
    })
  }

  for (const conv of conversations) {
    const latest = latestByConv.get(conv.id)
    entries.push({
      kind: 'conversacion',
      date: conv.lastMessageAt ?? conv.createdAt ?? new Date().toISOString(),
      title: `Conversación ${CHANNEL_LABEL[conv.channel ?? 'whatsapp']}`,
      detail: latest
        ? `${latest.direction === 'inbound' ? '←' : '→'} ${truncate(latest.text)} (${latest.count} mensaje${latest.count === 1 ? '' : 's'})`
        : CONV_STATUS_LABEL[conv.status ?? 'open'],
      href: `/workspace/inbox?c=${conv.id}`,
      direction: latest?.direction === 'inbound' ? 'in' : latest ? 'out' : 'neutral',
    })
  }

  for (const msg of emailMessagesRes.docs as EmailMessage[]) {
    entries.push({
      kind: 'email_buzon',
      date: msg.date,
      title: msg.subject ?? '(sin asunto)',
      detail: msg.snippet ? truncate(msg.snippet) : msg.fromEmail ?? null,
      href: '/workspace/email',
      direction: msg.direction === 'inbound' ? 'in' : 'out',
    })
  }

  for (const log of emailLogRes.docs as EmailLog[]) {
    entries.push({
      kind: 'email_enviado',
      date: log.createdAt ?? new Date().toISOString(),
      title: `Email enviado: ${log.subject}`,
      detail: `Resend · ${log.status}`,
      href: '/workspace/email',
      direction: 'out',
    })
  }

  for (const appt of appointmentsRes.docs as Appointment[]) {
    entries.push({
      kind: 'cita',
      date: appt.start,
      title: `Cita: ${appt.title}`,
      detail: `${appt.status}${appt.location ? ` · ${appt.location}` : ''}`,
      href: null,
      direction: 'neutral',
    })
  }

  for (const task of tasksRes.docs as Task[]) {
    entries.push({
      kind: 'tarea',
      date: task.dueDate ?? task.createdAt ?? new Date().toISOString(),
      title: task.title,
      detail: `Tarea · ${task.status} · prioridad ${task.priority}`,
      href: `/workspace/tasks/${task.id}`,
      direction: 'neutral',
    })
  }

  for (const form of formsRes.docs as FormSubmission[]) {
    entries.push({
      kind: 'formulario',
      date: form.createdAt ?? new Date().toISOString(),
      title: `Formulario: ${form.formName}`,
      detail: form.isComplaint ? 'Queja / alerta' : form.respondentEmail ?? null,
      href: null,
      direction: form.isComplaint ? 'in' : 'neutral',
    })
  }

  for (const payment of paymentsRes.docs as Payment[]) {
    entries.push({
      kind: 'cobro',
      date: payment.dueDate,
      title: `Cobro${payment.concept ? `: ${payment.concept}` : ''}`,
      detail: `$${payment.amount?.toFixed(2)} · ${payment.status}`,
      href: '/workspace/billing',
      direction: 'neutral',
    })
  }

  const timeline = entries
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 60)

  return {
    type,
    ...(isLead ? { lead: record as Lead } : { client: record as Client }),
    activities: activitiesRes.docs as Activity[],
    timeline,
    conversations: (conversations as Conversation[]).map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      contactAddress: c.contactAddress,
      lastMessageAt: c.lastMessageAt ?? null,
    })),
  }
}
