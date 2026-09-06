import 'server-only'

import type { Payload } from 'payload'
import type { Activity, Conversation, ConversationSummary, Lead, Message, User } from '@/payload-types'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/crm-filters'
import { crmAgentWhere } from '@/lib/crm-data'
import {
  computeDealVelocity,
  computeWindowState,
  relativeLabel,
  resolveLastActiveTimestamp,
  type DealVelocity,
} from '@/lib/crm-pipeline-window'

const MAX_CARDS = LEAD_STATUSES.length * 60

export interface PipelineCard {
  id: number
  fullName: string
  companyName: string | null
  city: string | null
  source: string | null
  phone: string | null
  email: string | null
  estimatedValue: number | null
  assignedTo: { id: number; name: string } | null
  commercialNotes: string | null
  notes: string | null
  status: LeadStatus
  createdAt: string
  channel: Conversation['channel'] | null
  conversationId: number | null
  lastMessageAt: string | null
  lastInboundAt: string | null
  /** Minutos restantes de la ventana de 24h de Meta; null = sin conversación aún, <=0 = expirada. */
  windowMinutesRemaining: number | null
  /** Proxy determinista: el último evento de la conversación fue entrante (nadie respondió después). */
  needsReply: boolean
  minutesSinceLastInbound: number | null
  lastMessage: { direction: Message['direction']; text: string; relative: string } | null
  aiSummary: { sentiment: ConversationSummary['sentiment']; summary: string } | null
  convertedClientId: number | null
  velocity: DealVelocity
}

export interface PipelineColumn {
  status: LeadStatus
  total: number
  cards: PipelineCard[]
}

function relationId(value: number | { id: number } | null | undefined): number | undefined {
  if (value == null) return undefined
  return typeof value === 'object' ? value.id : value
}

function agentName(value: Lead['assignedTo']): { id: number; name: string } | null {
  if (!value || typeof value === 'number') return null
  const user = value as User
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return { id: user.id, name: name || user.email }
}

/**
 * Contrato agregado del Pipeline Kanban (`/workspace/crm`, vista pipeline):
 * leads del tenant activo agrupados por columna (`status`), con la señal
 * mínima de conversación/IA que necesita cada tarjeta. Batched en 4
 * consultas (leads, conversations, conversation-summaries, messages) para
 * evitar N+1 sin importar cuántos leads tenga la columna.
 */
export async function getCrmPipelineData({
  payload,
  user,
  tenantId,
  agent,
  currentUserId,
}: {
  payload: Payload
  user: User
  tenantId: number
  /** Filtro por agente de la vista CRM ('me' | id de usuario). */
  agent?: string
  currentUserId?: number
}): Promise<PipelineColumn[]> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  const agentCond = crmAgentWhere(agent, 'assignedTo', currentUserId)
  const leadsResult = await query({
    collection: 'leads',
    depth: 1,
    limit: MAX_CARDS,
    sort: '-createdAt',
    where: agentCond ? { and: [{ tenant: { equals: tenantId } }, agentCond] } : { tenant: { equals: tenantId } },
    select: {
      fullName: true,
      companyName: true,
      city: true,
      source: true,
      commercialNotes: true,
      status: true,
      phone: true,
      email: true,
      estimatedValue: true,
      assignedTo: true,
      notes: true,
      createdAt: true,
      convertedClient: true,
    },
  })
  const leads = leadsResult.docs as Lead[]
  const leadIds = leads.map((lead) => lead.id)

  const [conversationsResult, summariesResult, activitiesResult] = await Promise.all([
    leadIds.length
      ? query({
          collection: 'conversations',
          depth: 0,
          limit: leadIds.length * 2,
          sort: '-lastMessageAt',
          where: { and: [{ tenant: { equals: tenantId } }, { lead: { in: leadIds } }] },
        })
      : Promise.resolve({ docs: [] as Conversation[] }),
    leadIds.length
      ? query({
          collection: 'conversation-summaries',
          depth: 0,
          limit: leadIds.length * 2,
          sort: '-createdAt',
          where: { and: [{ tenant: { equals: tenantId } }, { lead: { in: leadIds } }] },
        })
      : Promise.resolve({ docs: [] as ConversationSummary[] }),
    leadIds.length
      ? query({
          collection: 'activities',
          depth: 0,
          limit: Math.max(leadIds.length * 10, 1000),
          sort: '-occurredAt',
          where: { and: [{ tenant: { equals: tenantId } }, { lead: { in: leadIds } }] },
          select: { lead: true, occurredAt: true },
        })
      : Promise.resolve({ docs: [] as Activity[] }),
  ])

  // Docs vienen ordenados por más reciente primero; nos quedamos con el primero por lead.
  const conversationByLead = new Map<number, Conversation>()
  for (const conversation of conversationsResult.docs as Conversation[]) {
    const leadId = relationId(conversation.lead)
    if (leadId && !conversationByLead.has(leadId)) conversationByLead.set(leadId, conversation)
  }

  const summaryByLead = new Map<number, ConversationSummary>()
  for (const summary of summariesResult.docs as ConversationSummary[]) {
    const leadId = relationId(summary.lead)
    if (leadId && !summaryByLead.has(leadId)) summaryByLead.set(leadId, summary)
  }

  const lastActivityByLead = new Map<number, Activity>()
  for (const activity of activitiesResult.docs as Activity[]) {
    const leadId = relationId(activity.lead)
    if (leadId && !lastActivityByLead.has(leadId)) lastActivityByLead.set(leadId, activity)
  }

  // Garantizar que ningún lead con actividad quede omitido si leads hiper-activos
  // llenaron el cupo inicial: consultamos en chunks acotados los leads faltantes.
  const missingLeadIds = leadIds.filter((id) => !lastActivityByLead.has(id))
  if (missingLeadIds.length > 0) {
    const CHUNK_SIZE = 25
    for (let i = 0; i < missingLeadIds.length; i += CHUNK_SIZE) {
      const chunk = missingLeadIds.slice(i, i + CHUNK_SIZE)
      const fallbackResults = await Promise.all(
        chunk.map((id) =>
          query({
            collection: 'activities',
            depth: 0,
            limit: 1,
            sort: '-occurredAt',
            where: { and: [{ tenant: { equals: tenantId } }, { lead: { equals: id } }] },
            select: { lead: true, occurredAt: true },
          }),
        ),
      )
      for (const res of fallbackResults) {
        const doc = res.docs[0] as Activity | undefined
        if (doc) {
          const leadId = relationId(doc.lead)
          if (leadId) lastActivityByLead.set(leadId, doc)
        }
      }
    }
  }

  const conversationIds = Array.from(conversationByLead.values())
    .map((conversation) => conversation.id)
    .filter((id): id is number => typeof id === 'number')

  const messagesResult = conversationIds.length
    ? await query({
        collection: 'messages',
        depth: 0,
        // Sobre-fetch acotado: suficiente para cubrir el último mensaje de cada conversación sin N+1.
        limit: Math.min(conversationIds.length * 4, 400),
        sort: '-sentAt',
        where: { and: [{ tenant: { equals: tenantId } }, { conversation: { in: conversationIds } }] },
      })
    : { docs: [] as Message[] }

  const lastMessageByConversation = new Map<number, Message>()
  for (const message of messagesResult.docs as Message[]) {
    const conversationId = relationId(message.conversation)
    if (conversationId && !lastMessageByConversation.has(conversationId)) {
      lastMessageByConversation.set(conversationId, message)
    }
  }

  const now = Date.now()
  const cards: PipelineCard[] = leads.map((lead) => {
    const conversation = conversationByLead.get(lead.id)
    const lastMessage = conversation ? lastMessageByConversation.get(conversation.id) : undefined
    const lastInboundAt = conversation?.lastInboundAt ?? null
    const lastMessageAt = conversation?.lastMessageAt ?? null
    const { windowMinutesRemaining, needsReply, minutesSinceLastInbound } = computeWindowState(
      lastInboundAt,
      lastMessageAt,
      now,
    )

    const summary = summaryByLead.get(lead.id)
    const lastActivity = lastActivityByLead.get(lead.id)
    const lastActiveAt = resolveLastActiveTimestamp(
      lastMessageAt,
      lastActivity?.occurredAt,
      lead.createdAt,
    )
    const velocity = computeDealVelocity(lastActiveAt, now)

    return {
      id: lead.id,
      fullName: lead.fullName,
      companyName: lead.companyName ?? null,
      city: lead.city ?? null,
      source: lead.source ?? null,
      phone: lead.phone ?? null,
      email: lead.email ?? null,
      estimatedValue: lead.estimatedValue ?? null,
      assignedTo: agentName(lead.assignedTo),
      commercialNotes: lead.commercialNotes ?? null,
      notes: lead.notes ?? null,
      status: lead.status,
      createdAt: lead.createdAt,
      channel: conversation?.channel ?? null,
      conversationId: conversation?.id ?? null,
      lastMessageAt,
      lastInboundAt,
      windowMinutesRemaining,
      needsReply,
      minutesSinceLastInbound,
      lastMessage: lastMessage
        ? {
            direction: lastMessage.direction,
            text: lastMessage.text || `[${lastMessage.type}]`,
            relative: relativeLabel(lastMessage.sentAt ?? null, now),
          }
        : null,
      aiSummary: summary ? { sentiment: summary.sentiment, summary: summary.summary } : null,
      convertedClientId: relationId(lead.convertedClient) ?? null,
      velocity,
    }
  })

  return LEAD_STATUSES.map((status) => {
    const columnCards = cards.filter((card) => card.status === status)
    return { status, total: columnCards.length, cards: columnCards }
  })
}
