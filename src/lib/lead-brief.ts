import { generateObject } from 'ai'
import { z } from 'zod'

import { getTenantAiModel } from '@/lib/ai-provider'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

/**
 * Núcleo del Brief 360 del lead (Attio-style AI attributes). NO lleva
 * 'server-only': forma parte del grafo de imports de payload.config.ts vía
 * jobs/generateLeadBrief (mismo criterio que followups-today.ts).
 *
 * Reúne las señales que ya captura el sistema (lead, actividades,
 * resúmenes de conversación, cobros pendientes), le pide a la IA del
 * tenant un brief estructurado con mensaje de WhatsApp sugerido, y hace
 * upsert del más reciente en `lead-briefs`.
 */

export const AI_BRIEF_SCHEMA = z.object({
  resumenEjecutivo: z
    .string()
    .describe('Quién es, qué quiere y por dónde va la conversación, en 2-4 frases en español'),
  senales: z
    .array(z.string())
    .describe('Señales concretas detectadas (interés, objeciones, urgencia, cobros), una por entrada'),
  sentimiento: z.enum(['positivo', 'neutral', 'negativo']),
  proximaAccion: z.string().describe('Próxima acción concreta sugerida, en 1 frase'),
  mensajeWhatsapp: z
    .string()
    .describe('Mensaje de WhatsApp pre-escrito y personalizado para retomar contacto, en español, tono cercano, máx 500 caracteres'),
})

export interface LeadBriefResult {
  id: number
  summary: string
  senales: string
  sentiment: 'positivo' | 'neutral' | 'negativo'
  proximaAccion: string
  mensajeWhatsapp: string
  model: string
}

interface GenerateLeadBriefOptions {
  payload: Payload
  tenantId: number
  leadId: number
  /** Si no viene (job del sistema), las consultas van con overrideAccess. */
  user?: User
}

/** Consulta corta con control de acceso si hay usuario, override si es job del sistema. */
function queryOpts(options: GenerateLeadBriefOptions) {
  return options.user
    ? { overrideAccess: false as const, user: options.user }
    : { overrideAccess: true as const }
}

export async function generateLeadBrief(options: GenerateLeadBriefOptions): Promise<LeadBriefResult> {
  const { payload, tenantId, leadId } = options
  const opts = queryOpts(options)

  const leadRes = await payload.find({
    collection: 'leads',
    limit: 1,
    depth: 0,
    where: { and: [{ id: { equals: leadId } }, { tenant: { equals: tenantId } }] },
    ...opts,
  })
  const lead = leadRes.docs[0] as unknown as Record<string, unknown> | undefined
  if (!lead) throw new Error('Lead no encontrado en el tenant activo')

  const [activitiesRes, summariesRes, paymentsRes] = await Promise.all([
    payload.find({
      collection: 'activities',
      limit: 5,
      depth: 0,
      sort: '-occurredAt',
      select: { type: true, summary: true, occurredAt: true },
      where: { and: [{ tenant: { equals: tenantId } }, { lead: { equals: leadId } }] },
      ...opts,
    }),
    payload.find({
      collection: 'conversation-summaries',
      limit: 2,
      depth: 0,
      sort: '-createdAt',
      select: { summary: true, sentiment: true, objections: true, nextSteps: true },
      where: { and: [{ tenant: { equals: tenantId } }, { lead: { equals: leadId } }] },
      ...opts,
    }),
    payload.count({
      collection: 'payments',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { client: { equals: lead.convertedClient ?? -1 } },
          { status: { in: ['pendiente', 'vencido'] } },
        ],
      },
      ...opts,
    }),
  ])

  const activities = (activitiesRes.docs as Array<Record<string, unknown>>)
    .map((a) => `${String(a.type)}: ${String(a.summary ?? '').slice(0, 160)}`)
  const summaries = (summariesRes.docs as Array<Record<string, unknown>>).map((cs) =>
    `Resumen IA: ${String(cs.summary ?? '').slice(0, 300)} | Sentimiento: ${String(cs.sentiment ?? 'neutral')} | Objeciones: ${String(cs.objections ?? 'n/a')} | Pasos: ${String(cs.nextSteps ?? 'n/a')}`,
  )

  const leadContext = [
    `Nombre: ${String(lead.fullName ?? '')}`,
    `Empresa: ${String(lead.companyName ?? 'n/a')}`,
    `Servicio de interés: ${String(lead.servicioInteres ?? 'n/a')}`,
    `Persona de interés: ${String(lead.personaInteres ?? 'n/a')}`,
    `Nivel de interés: ${String(lead.nivelInteres ?? 'sin definir')} | Prioridad: ${String(lead.prioridad ?? 'sin definir')}`,
    `Etapa: ${String(lead.status ?? '')} | Llamadas hechas: ${String(lead.numeroDeLlamadas ?? 0)} | Última llamada: ${String(lead.lastContactedAt ?? 'nunca')}`,
    `Notas de llamada: ${String(lead.notasLlamada ?? 'n/a').slice(0, 600)}`,
    `Notas internas: ${String(lead.notes ?? 'n/a').slice(0, 600)}`,
    `Comentarios comerciales: ${String(lead.commercialNotes ?? 'n/a').slice(0, 600)}`,
    `Cobros pendientes del cliente (si ya convirtió): ${paymentsRes.totalDocs}`,
    activities.length ? `Últimas actividades:\n- ${activities.join('\n- ')}` : 'Sin actividades registradas',
    summaries.length ? summaries.join('\n') : 'Sin resúmenes de conversación con IA',
  ].join('\n')

  const ai = await getTenantAiModel(payload, tenantId)
  if (!ai) throw new Error('IA no configurada para este tenant — define proveedor y API key en Ajustes')
  const { model, provider, modelName } = ai

  const { object } = await generateObject({
    model,
    schema: AI_BRIEF_SCHEMA,
    prompt: [
      'Eres el analista comercial de un pequeño negocio venezolano que usa este CRM.',
      'Genera el brief 360 del siguiente lead para que el agente lo tenga fresco antes de contactarlo.',
      'Sé concreto y accionable; nada de relleno. El mensaje de WhatsApp debe sonar humano, cercano y corto (máx 500 caracteres), sin saludos corporativos.',
      '',
      leadContext,
    ].join('\n'),
  })

  const senalesTexto = (object.senales ?? []).join('\n')

  // Upsert del más reciente: un brief vigente por lead
  const existing = await payload.find({
    collection: 'lead-briefs',
    limit: 1,
    depth: 0,
    sort: '-createdAt',
    where: { and: [{ tenant: { equals: tenantId } }, { lead: { equals: leadId } }] },
    overrideAccess: true,
  })

  const data = {
    summary: object.resumenEjecutivo,
    senales: senalesTexto,
    sentiment: object.sentimiento,
    proximaAccion: object.proximaAccion,
    mensajeWhatsapp: object.mensajeWhatsapp,
    model: `${provider}/${modelName}`,
  }

  if (existing.docs[0]) {
    await payload.update({ collection: 'lead-briefs', id: existing.docs[0].id, data, overrideAccess: true })
    return { id: existing.docs[0].id, ...data }
  }

  // El índice único (tenant, lead) garantiza un brief vigente por lead bajo
  // concurrencia: si otra generación creó el registro entre el find y aquí,
  // la carrera termina en violación de unique → re-leer y actualizar.
  try {
    const created = await payload.create({
      collection: 'lead-briefs',
      data: { tenant: tenantId, lead: leadId, ...data },
      overrideAccess: true,
    })
    return { id: created.id, ...data }
  } catch (err) {
    const pgCode = (err as { cause?: { code?: string } }).cause?.code
    if (pgCode !== '23505' && !(err instanceof Error && err.message.includes('duplicate key'))) throw err

    const raced = await payload.find({
      collection: 'lead-briefs',
      limit: 1,
      depth: 0,
      sort: '-createdAt',
      where: { and: [{ tenant: { equals: tenantId } }, { lead: { equals: leadId } }] },
      overrideAccess: true,
    })
    if (!raced.docs[0]) throw err
    await payload.update({ collection: 'lead-briefs', id: raced.docs[0].id, data, overrideAccess: true })
    return { id: raced.docs[0].id, ...data }
  }
}
