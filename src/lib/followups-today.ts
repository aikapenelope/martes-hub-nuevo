import type { Payload } from 'payload'
import type { User } from '@/payload-types'

// NOTA: este archivo NO debe importar 'server-only': forma parte del grafo de
// imports de payload.config.ts (vía endpoints/followupsHoy.ts) y `pnpm migrate`
// corre fuera de Next (tsx puro), donde ese módulo lanza. Se ejecuta siempre
// en servidor por diseño, el guard sería redundante y rompe el build de Vercel.

const DAY_MS = 24 * 60 * 60 * 1000

interface PipelineRule {
  thresholdDays: number
  bonus: number
}

const LEAD_RULES: Record<string, PipelineRule> = {
  nuevo: { thresholdDays: 2, bonus: 20 },
  contactado: { thresholdDays: 3, bonus: 10 },
  calificado: { thresholdDays: 7, bonus: 5 },
}

const CLIENT_RULES: Record<string, PipelineRule> = {
  nuevo: { thresholdDays: 2, bonus: 20 },
  activo: { thresholdDays: 7, bonus: 0 },
  inactivo: { thresholdDays: 30, bonus: 0 },
}

interface ConversationRef {
  lastInboundAt: string | null
  lastMessageAt: string | null
}

export interface FollowUpItem {
  kind: 'lead' | 'client'
  id: number
  name: string
  phone: string
  pipeline: string
  daysSince: number
  reason: string
  priority: number
  waLink: string
  crmUrl: string
}

function digits(v: string | undefined | null): string {
  return (v ?? '').replace(/\D/g, '')
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * Criterio de negocio unificado de "a quién toca contactar hoy" (SLA por
 * etapa + ventana anti-spam de 24h desde el último mensaje entrante).
 * Fuente única de verdad para el endpoint /api/followups/hoy y para el
 * strip del cockpit. Siempre con user + overrideAccess: false — el filtro
 * de tenant va explícito en cada where.
 */
export async function collectFollowupsToday({
  payload,
  user,
  tenantId,
}: {
  payload: Payload
  user: User
  tenantId: number
}): Promise<FollowUpItem[]> {
  const now = Date.now()

  const conversationsByContactId = new Map<string, ConversationRef>()
  const conversations = await payload.find({
    collection: 'conversations',
    where: { tenant: { equals: tenantId } },
    limit: 1000,
    depth: 0,
    select: {
      lead: true,
      client: true,
      lastInboundAt: true,
      lastMessageAt: true,
    },
    overrideAccess: false,
    user,
  })
  for (const conv of conversations.docs) {
    for (const key of ['lead', 'client'] as const) {
      const ref = conv[key]
      const contactId = typeof ref === 'object' ? ref?.id : ref
      if (!contactId) continue
      const prev = conversationsByContactId.get(`${key}:${contactId}`)
      const candidate: ConversationRef = {
        lastInboundAt: conv.lastInboundAt ?? null,
        lastMessageAt: conv.lastMessageAt ?? null,
      }
      const candidateTime = Math.max(
        candidate.lastInboundAt ? Date.parse(candidate.lastInboundAt) : 0,
        candidate.lastMessageAt ? Date.parse(candidate.lastMessageAt) : 0,
      )
      const prevTime = prev
        ? Math.max(
            prev.lastInboundAt ? Date.parse(prev.lastInboundAt) : 0,
            prev.lastMessageAt ? Date.parse(prev.lastMessageAt) : 0,
          )
        : -1
      if (candidateTime >= prevTime) conversationsByContactId.set(`${key}:${contactId}`, candidate)
    }
  }

  const items: FollowUpItem[] = []

  const leads = await payload.find({
    collection: 'leads',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { status: { not_equals: 'descartado' } },
        { phone: { exists: true } },
        { convertedClient: { exists: false } },
      ],
    },
    limit: 500,
    depth: 0,
    select: {
      id: true,
      fullName: true,
      phone: true,
      status: true,
      createdAt: true,
    },
    overrideAccess: false,
    user,
  })

  for (const lead of leads.docs) {
    const rule = LEAD_RULES[lead.status]
    if (!rule || !lead.phone) continue
    const conv = conversationsByContactId.get(`lead:${lead.id}`)
    const lastInboundMs = conv?.lastInboundAt ? Date.parse(conv.lastInboundAt) : null
    if (lastInboundMs !== null && now - lastInboundMs < DAY_MS) continue

    const referenceMs =
      lastInboundMs ??
      (conv?.lastMessageAt ? Date.parse(conv.lastMessageAt) : null) ??
      Date.parse(lead.createdAt)
    const daysSince = Math.floor((now - referenceMs) / DAY_MS)
    if (daysSince < rule.thresholdDays) continue

    const reason = conv ? `${daysSince} días sin respuesta` : 'Nunca contactado'
    items.push({
      kind: 'lead',
      id: lead.id,
      name: lead.fullName,
      phone: digits(lead.phone),
      pipeline: lead.status,
      daysSince,
      reason,
      priority: daysSince * 10 + rule.bonus,
      waLink: `https://wa.me/${digits(lead.phone)}?text=${encodeURIComponent(
        `Hola ${firstName(lead.fullName)}, ¿cómo estás?`,
      )}`,
      crmUrl: `/workspace/crm/leads/${lead.id}`,
    })
  }

  const clients = await payload.find({
    collection: 'clients',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { phone: { exists: true } },
        { optOutAt: { exists: false } },
      ],
    },
    limit: 500,
    depth: 0,
    select: {
      id: true,
      name: true,
      phone: true,
      stage: true,
      createdAt: true,
    },
    overrideAccess: false,
    user,
  })

  for (const client of clients.docs) {
    const rule = CLIENT_RULES[client.stage]
    if (!rule || !client.phone) continue
    const conv = conversationsByContactId.get(`client:${client.id}`)
    const lastInboundMs = conv?.lastInboundAt ? Date.parse(conv.lastInboundAt) : null
    if (lastInboundMs !== null && now - lastInboundMs < DAY_MS) continue

    const referenceMs =
      lastInboundMs ??
      (conv?.lastMessageAt ? Date.parse(conv.lastMessageAt) : null) ??
      Date.parse(client.createdAt)
    const daysSince = Math.floor((now - referenceMs) / DAY_MS)
    if (daysSince < rule.thresholdDays) continue

    items.push({
      kind: 'client',
      id: client.id,
      name: client.name,
      phone: digits(client.phone),
      pipeline: client.stage,
      daysSince,
      reason: conv ? `${daysSince} días sin respuesta` : 'Nunca contactado',
      priority: daysSince * 10 + rule.bonus,
      waLink: `https://wa.me/${digits(client.phone)}?text=${encodeURIComponent(
        `Hola ${firstName(client.name)}, ¿cómo estás?`,
      )}`,
      crmUrl: `/workspace/crm/clientes/${client.id}`,
    })
  }

  items.sort((a, b) => b.priority - a.priority)

  return items
}
