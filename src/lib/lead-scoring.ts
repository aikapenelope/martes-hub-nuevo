import type { Payload } from 'payload'

import { runHotLeadAutomation } from '@/lib/hot-lead'

// NOTA: este archivo NO debe importar 'server-only': forma parte del grafo de
// imports de payload.config.ts (vía jobs/leadScoring.ts) y `pnpm migrate`
// corre fuera de Next (tsx puro), donde ese módulo lanza. Se ejecuta siempre
// en servidor por diseño (job + cron), el guard sería redundante.

const DAY_MS = 24 * 60 * 60 * 1000

export type LeadSentiment = 'positivo' | 'neutral' | 'negativo' | 'en_riesgo'
export type LeadNivelInteres = 'frio' | 'templado' | 'caliente'
export type LeadPrioridad = 'baja' | 'media' | 'alta'

export interface LeadScoringSignals {
  status: string
  createdAt: string
  lastInboundAt: string | null
  lastMessageAt: string | null
  numeroDeLlamadas: number
  pudoHablarDecisor: boolean
  visitadoPresencialmente: boolean
  /** Sentimiento del último resumen IA de conversación (null = sin resúmenes). */
  sentiment: LeadSentiment | null
}

export interface LeadScoreResult {
  score: number
  nivelInteres: LeadNivelInteres
  prioridad: LeadPrioridad
}

/** Señales de interés del lead por canal de contacto (hasta 3 llamadas saturan). */
const SENTIMENT_POINTS: Record<LeadSentiment, number> = {
  positivo: 25,
  neutral: 5,
  negativo: 0,
  en_riesgo: -15,
}

const STAGE_BONUS: Record<string, number> = {
  nuevo: 5,
  contactado: 10,
  calificado: 15,
}

// SLA por etapa — mismas reglas que LEAD_RULES en followups-today.ts.
const SLA_THRESHOLD_DAYS: Record<string, number> = {
  nuevo: 2,
  contactado: 3,
  calificado: 7,
}

/**
 * Fórmula de scoring aprobada (2026-09-08): score aditivo por señales con
 * penalización SLA. Recalcula `nivelInteres`/`prioridad` en ambas direcciones
 * (sube y baja según señales — decisión de producto: el scoring automático es
 * la fuente de verdad).
 *
 * - Inbound WhatsApp (conversation.lastInboundAt): ≤24h +30, ≤3d +15, ≤7d +5.
 * - Sentimiento del último conversation-summary: positivo +25, neutral +5,
 *   negativo 0, en_riesgo −15.
 * - Llamadas: +5 c/u (tope +15) · decisor +10 · visita presencial +10.
 * - Bonus de etapa: nuevo +5, contactado +10, calificado +15.
 * - SLA vencido (días desde la última señal, criterio followups-today):
 *   −10 por cada 2 días completos de exceso; el score no baja de 0.
 *
 * Umbrales: caliente ≥60, templado ≥30, frío <30 · prioridad alta ≥70,
 * media ≥40, baja <40.
 */
export function computeLeadScore(
  signals: LeadScoringSignals,
  now: number = Date.now(),
): LeadScoreResult {
  const inboundMs = signals.lastInboundAt ? Date.parse(signals.lastInboundAt) : null
  let score = 0

  if (inboundMs !== null) {
    const ageDays = (now - inboundMs) / DAY_MS
    if (ageDays <= 1) score += 30
    else if (ageDays <= 3) score += 15
    else if (ageDays <= 7) score += 5
  }

  if (signals.sentiment) score += SENTIMENT_POINTS[signals.sentiment]

  score += Math.min(Math.max(signals.numeroDeLlamadas ?? 0, 0), 3) * 5
  if (signals.pudoHablarDecisor) score += 10
  if (signals.visitadoPresencialmente) score += 10

  score += STAGE_BONUS[signals.status] ?? 0

  // Referencia SLA: última entrada del lead, o último mensaje, o creación —
  // misma cadena que followups-today.ts.
  const referenceMs =
    inboundMs ??
    (signals.lastMessageAt ? Date.parse(signals.lastMessageAt) : null) ??
    Date.parse(signals.createdAt)
  const daysSince = Math.floor((now - referenceMs) / DAY_MS)
  const thresholdDays = SLA_THRESHOLD_DAYS[signals.status]
  if (thresholdDays != null && daysSince > thresholdDays) {
    score -= 10 * Math.floor((daysSince - thresholdDays) / 2)
  }

  score = Math.max(0, score)

  return {
    score,
    nivelInteres: score >= 60 ? 'caliente' : score >= 30 ? 'templado' : 'frio',
    prioridad: score >= 70 ? 'alta' : score >= 40 ? 'media' : 'baja',
  }
}

interface InboundRef {
  lastInboundAt: string | null
  lastMessageAt: string | null
}

/**
 * Recorre TODAS las páginas de un find de Payload (hasNextPage). Paginar las
 * señales es obligatorio: con un solo page de 1000, un tenant grande perdería
 * conversaciones/resúmenes y los leads se degradarían por señales incompletas
 * (hallazgo Devin PR #102).
 */
export async function findAllPages<T>(
  find: (page: number) => Promise<{ docs: T[]; hasNextPage?: boolean }>,
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const res = await find(page)
    all.push(...res.docs)
    hasMore = Boolean(res.hasNextPage)
    page += 1
  }
  return all
}

export interface ScoreTenantLeadsResult {
  scored: number
  updated: number
  /** Leads promovidos a caliente por señales (disparan automatización hot-lead). */
  promoted: number
}

/**
 * Recalcula nivelInteres/prioridad de todos los leads activos del tenant
 * (mismo criterio de elegibilidad que followups-today: sin descartados ni
 * convertidos). Solo escribe cuando el resultado cambia — evita churn de
 * updatedAt en cada corrida. Job del sistema: escrituras con
 * overrideAccess, tenant siempre explícito en cada where.
 */
export async function scoreTenantLeads({
  payload,
  tenantId,
  now,
}: {
  payload: Payload
  tenantId: number
  /** Marca de tiempo de referencia del scoring; default Date.now() (inyectable para tests). */
  now?: number
}): Promise<ScoreTenantLeadsResult> {
  const nowMs = now ?? Date.now()
  const tenantWhere = { tenant: { equals: tenantId } }

  // Señal inbound por lead: conversación más reciente (mismo mapeo que
  // followups-today.ts — varios docs de conversación: gana el más nuevo).
  // Paginado completo: ver findAllPages.
  const inboundByLeadId = new Map<number, InboundRef>()
  const conversations = await findAllPages((page) =>
    payload.find({
      collection: 'conversations',
      where: tenantWhere,
      limit: 500,
      page,
      depth: 0,
      select: { lead: true, lastInboundAt: true, lastMessageAt: true },
      overrideAccess: true,
    }),
  )
  for (const conv of conversations) {
    const leadId = typeof conv.lead === 'object' ? conv.lead?.id : conv.lead
    if (!leadId) continue
    const candidate: InboundRef = {
      lastInboundAt: conv.lastInboundAt ?? null,
      lastMessageAt: conv.lastMessageAt ?? null,
    }
    const candidateTime = Math.max(
      candidate.lastInboundAt ? Date.parse(candidate.lastInboundAt) : 0,
      candidate.lastMessageAt ? Date.parse(candidate.lastMessageAt) : 0,
    )
    const prev = inboundByLeadId.get(leadId)
    const prevTime = prev
      ? Math.max(
          prev.lastInboundAt ? Date.parse(prev.lastInboundAt) : 0,
          prev.lastMessageAt ? Date.parse(prev.lastMessageAt) : 0,
        )
      : -1
    if (candidateTime >= prevTime) inboundByLeadId.set(leadId, candidate)
  }

  // Último sentimiento IA por lead: barrido desc por createdAt, primero gana
  // (las páginas siguientes contienen resúmenes más viejos, así que el merge
  // conserva el más reciente por lead aunque caiga en una página tardía).
  // Paginado completo: ver findAllPages.
  const sentimentByLeadId = new Map<number, LeadSentiment>()
  const summaries = await findAllPages((page) =>
    payload.find({
      collection: 'conversation-summaries',
      where: tenantWhere,
      limit: 500,
      page,
      depth: 0,
      sort: '-createdAt',
      select: { lead: true, sentiment: true },
      overrideAccess: true,
    }),
  )
  for (const sum of summaries) {
    const leadId = typeof sum.lead === 'object' ? sum.lead?.id : sum.lead
    if (!leadId || sentimentByLeadId.has(leadId)) continue
    sentimentByLeadId.set(leadId, sum.sentiment)
  }

  let scored = 0
  let updated = 0
  let promoted = 0
  let page = 1
  let hasMore = true

  while (hasMore) {
    const leads = await payload.find({
      collection: 'leads',
      where: {
        and: [
          tenantWhere,
          { status: { not_equals: 'descartado' } },
          { convertedClient: { exists: false } },
        ],
      },
      limit: 500,
      page,
      depth: 0,
      sort: 'id',
      select: {
        fullName: true,
        status: true,
        createdAt: true,
        numeroDeLlamadas: true,
        pudoHablarDecisor: true,
        visitadoPresencialmente: true,
        nivelInteres: true,
        prioridad: true,
        assignedTo: true,
      },
      overrideAccess: true,
    })

    for (const lead of leads.docs) {
      scored++
      const conv = inboundByLeadId.get(lead.id)
      const result = computeLeadScore(
        {
          status: lead.status,
          createdAt: lead.createdAt,
          lastInboundAt: conv?.lastInboundAt ?? null,
          lastMessageAt: conv?.lastMessageAt ?? null,
          numeroDeLlamadas: lead.numeroDeLlamadas ?? 0,
          pudoHablarDecisor: Boolean(lead.pudoHablarDecisor),
          visitadoPresencialmente: Boolean(lead.visitadoPresencialmente),
          sentiment: sentimentByLeadId.get(lead.id) ?? null,
        },
        nowMs,
      )

      const changed = lead.nivelInteres !== result.nivelInteres || lead.prioridad !== result.prioridad
      if (changed) {
        await payload.update({
          collection: 'leads',
          id: lead.id,
          data: { nivelInteres: result.nivelInteres, prioridad: result.prioridad },
          overrideAccess: true,
        })
        updated++
      }

      // Automatización hot-lead (modo sistema, sin usuario: ver hot-lead.ts).
      // Se ejecuta para TODO lead caliente, no solo en la transición: es
      // idempotente (verifica brief y tarea existentes antes de crear), así
      // que si una pasada anterior falló a mitad, el barrido diario repara lo
      // que falte — sin duplicar recordatorios ni llamadas pagadas al
      // proveedor de IA (hallazgo Devin PR #102). Asignatario = agente del
      // lead. `promoted` cuenta solo la transición a caliente.
      if (result.nivelInteres === 'caliente') {
        const assigneeId =
          typeof lead.assignedTo === 'object' ? (lead.assignedTo?.id ?? null) : (lead.assignedTo ?? null)
        await runHotLeadAutomation({
          payload,
          tenantId,
          leadId: lead.id,
          leadName: lead.fullName,
          assigneeId,
        })
        if (changed && lead.nivelInteres !== 'caliente') promoted++
      }
    }

    hasMore = Boolean(leads.hasNextPage)
    page += 1
  }

  return { scored, updated, promoted }
}
