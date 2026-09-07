'use server'

import { getScopedLead } from '@/lib/crm-scoped-entities'
import { generateLeadBrief } from '@/lib/lead-brief'
import { getWorkspaceContext } from '@/lib/workspace-context'

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

export interface LeadBriefPayload {
  summary: string
  senales: string
  sentiment: 'positivo' | 'neutral' | 'negativo' | null
  proximaAccion: string
  mensajeWhatsapp: string
  model: string | null
  updatedAt: string | null
}

/** Último brief persistido y consultable del lead (o null si nunca se generó). */
export async function getLeadBriefAction(leadId: number): Promise<ActionResult<{ brief: LeadBriefPayload | null }>> {
  const context = await getWorkspaceContext()
  await getScopedLead(leadId) // valida pertenencia al tenant activo

  const res = await context.payload.find({
    collection: 'lead-briefs',
    limit: 1,
    depth: 0,
    sort: '-createdAt',
    where: { and: [{ tenant: { equals: context.tenantId } }, { lead: { equals: leadId } }] },
    overrideAccess: false,
    user: context.user,
  })
  const doc = res.docs[0] as unknown as Record<string, unknown> | undefined
  if (!doc) return { ok: true, brief: null }

  return {
    ok: true,
    brief: {
      summary: String(doc.summary ?? ''),
      senales: String(doc.senales ?? ''),
      sentiment: (doc.sentiment as LeadBriefPayload['sentiment']) ?? null,
      proximaAccion: String(doc.proximaAccion ?? ''),
      mensajeWhatsapp: String(doc.mensajeWhatsapp ?? ''),
      model: doc.model ? String(doc.model) : null,
      updatedAt: (doc.updatedAt as string) ?? null,
    },
  }
}

/** Genera el brief 360 on demand (cuesta tokens: solo editores). */
export async function generateLeadBriefAction(leadId: number): Promise<ActionResult<{ brief: LeadBriefPayload }>> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para generar briefs')
  await getScopedLead(leadId)

  const brief = await generateLeadBrief({
    payload: context.payload,
    tenantId: context.tenantId,
    leadId,
    user: context.user,
  })

  return {
    ok: true,
    brief: {
      summary: brief.summary,
      senales: brief.senales,
      sentiment: brief.sentiment,
      proximaAccion: brief.proximaAccion,
      mensajeWhatsapp: brief.mensajeWhatsapp,
      model: brief.model,
      updatedAt: new Date().toISOString(),
    },
  }
}
