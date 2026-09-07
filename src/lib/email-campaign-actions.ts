'use server'

import { revalidatePath } from 'next/cache'

import { renderEmailHtml } from '@/email/layout'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
import { sanitizeCampaignHtml } from '@/email/sanitize'
import { collectCampaignRecipients } from '@/lib/campaign-recipients'
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

/**
 * Renderiza el HTML final de la campaña con el layout de marca — alimenta
 * la vista previa del editor (desktop/móvil) sin tocar la BD.
 */
export async function renderCampaignPreviewAction(input: {
  subject: string
  preheader?: string
  bodyHtml: string
}): Promise<{ html: string }> {
  await getWorkspaceContext()
  return {
    html: renderEmailHtml({
      title: input.subject.trim().slice(0, 200) || 'Vista previa',
      bodyHtml: sanitizeCampaignHtml(input.bodyHtml.slice(0, 20000)),
      preheader: input.preheader?.trim().slice(0, 200) || undefined,
    }),
  }
}

/**
 * Cuenta los destinatarios reales de un segmento ANTES de enviar: leads con
 * email + clientes con email y sin opt-out, deduplicados por dirección en
 * minúsculas — misma regla de negocio del job send-campaign-batch.
 */
export async function campaignRecipientCountAction(
  segmentId?: number,
): Promise<{ total: number; leads: number; clients: number }> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para ver campañas')

  // Validación de propiedad del rubro: sin esto, un segmentId ajeno al tenant
  // revela conteos de otro workspace.
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

  // Misma fuente única que el job de envío: el alcance mostrado no puede
  // desviarse de lo que realmente se entrega (segmento, conversión, etapa,
  // opt-out, tope 500, dedupe por email).
  const recipients = await collectCampaignRecipients({
    payload: context.payload,
    tenantId: context.tenantId,
    segmentId: segmentId && Number.isInteger(segmentId) && segmentId > 0 ? segmentId : undefined,
    user: context.user,
  })

  let leadCount = 0
  let clientCount = 0
  for (const recipient of recipients.values()) {
    if (recipient.leadId) leadCount += 1
    else if (recipient.clientId) clientCount += 1
  }

  return { total: recipients.size, leads: leadCount, clients: clientCount }
}

/** Envío de prueba a una dirección (default: el propio usuario) — no crea ni toca la campaña. */
export async function sendCampaignTestAction(input: {
  subject: string
  preheader?: string
  bodyHtml: string
  to?: string
}): Promise<{ to: string }> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para enviar campañas')
  if (!process.env.RESEND_API_KEY) throw new Error('Email no configurado (falta RESEND_API_KEY)')
  // Rate limit: mismo criterio que el resto de acciones de costo variable —
  // sin tope, llamadas automatizadas agotan la cuota del proveedor.
  if (!(await checkUserActionRateLimit(context.user.id, 'campaign-test'))) {
    throw new Error('Demasiados envíos de prueba seguidos — espera un minuto')
  }

  // Solo al correo del PROPIO editor: aceptar direcciones arbitrarias
  // convertiría la prueba en un canal de spam/phishing con el remitente
  // configurado del tenant.
  const to = (context.user.email || '').trim()
  if (!to) throw new Error('Tu usuario no tiene correo para recibir la prueba')

  const subject = input.subject.trim().slice(0, 200) || 'Prueba de campaña'
  const html = renderEmailHtml({
    title: subject,
    // Mismo sanitizador que el guardado y el envío real: el test no es una
    // vía para entregar HTML activo o engañoso.
    bodyHtml: sanitizeCampaignHtml(input.bodyHtml.slice(0, 20000)),
    preheader: input.preheader?.trim().slice(0, 200) || undefined,
  })

  await context.payload.sendEmail({ to, subject: `[PRUEBA] ${subject}`, html })
  return { to }
}
