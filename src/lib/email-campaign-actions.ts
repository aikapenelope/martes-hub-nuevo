'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

const MAX_NAME = 160
const MAX_SUBJECT = 200

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalText(formData: FormData, key: string, max: number): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().slice(0, max)
}

/** Crea una campaña de email en borrador. El envío es un paso aparte (sendEmailCampaignAction). */
export async function createEmailCampaignAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para crear campañas de email')

  const segmentRaw = formData.get('segment')
  const segmentId = segmentRaw ? Number(segmentRaw) : undefined
  if (segmentId && Number.isInteger(segmentId) && segmentId > 0) {
    const check = await context.payload.find({
      collection: 'segments',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: { and: [{ id: { equals: segmentId } }, { tenant: { equals: context.tenantId } }] },
    })
    if (check.docs.length === 0) throw new Error('Rubro no encontrado en el tenant activo')
  }

  await context.payload.create({
    collection: 'email-campaigns',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: requiredText(formData, 'name', MAX_NAME),
      subject: requiredText(formData, 'subject', MAX_SUBJECT),
      preheader: optionalText(formData, 'preheader', 200),
      bodyHtml: requiredText(formData, 'bodyHtml', 20000),
      segment: segmentId && Number.isInteger(segmentId) ? segmentId : undefined,
      status: 'draft',
    },
  })

  revalidatePath('/workspace/email')
}

/**
 * Envía una campaña — mismo flujo que `sendCampaignHandler` (marca
 * "sending" y encola el job `send-campaign-batch`), pero vía Local API en
 * lugar de HTTP, consistente con el resto de Server Actions del workspace.
 */
export async function sendEmailCampaignAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para enviar campañas')

  if (!process.env.RESEND_API_KEY) throw new Error('Email no configurado (falta RESEND_API_KEY)')

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador de campaña inválido')

  const check = await context.payload.find({
    collection: 'email-campaigns',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const campaign = check.docs[0]
  if (!campaign) throw new Error('Campaña no encontrada en el tenant activo')
  if (campaign.status === 'sending') throw new Error('La campaña ya está en proceso de envío')
  if (campaign.status === 'sent' || campaign.status === 'partial') throw new Error('La campaña ya fue enviada previamente')

  await context.payload.update({
    collection: 'email-campaigns',
    id,
    overrideAccess: false,
    user: context.user,
    data: { status: 'sending' },
  })

  await context.payload.jobs.queue({
    task: 'send-campaign-batch',
    input: { campaignId: id, tenantId: context.tenantId },
    overrideAccess: true,
  })

  revalidatePath('/workspace/email')
}
