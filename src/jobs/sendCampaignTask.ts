import type { TaskConfig } from 'payload'
import { renderEmailHtml } from '../email/layout'
import { collectCampaignRecipients } from '../lib/campaign-recipients'

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

export const sendCampaignTask: TaskConfig = {
  slug: 'send-campaign-batch',
  label: 'Envío asíncrono de campaña de email',
  inputSchema: [
    { name: 'campaignId', type: 'number', required: true },
    { name: 'tenantId', type: 'number', required: true },
  ],
  outputSchema: [
    { name: 'sent', type: 'number' },
    { name: 'failed', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const rawInput = (input ?? {}) as Record<string, unknown>
    const campaignId = Number(rawInput.campaignId)
    const tenantId = Number(rawInput.tenantId)

    if (!Number.isInteger(campaignId) || !Number.isInteger(tenantId)) {
      throw new Error('Parámetros de campaña inválidos (campaignId y tenantId requeridos)')
    }

    // El job recibe campaignId y tenantId por separado: sin esta validación,
    // un job con IDs cruzados enviaría contenido de un tenant a los
    // destinatarios de otro.
    const campaignRes = await req.payload.find({
      collection: 'email-campaigns',
      limit: 1,
      depth: 1,
      where: { and: [{ id: { equals: campaignId } }, { tenant: { equals: tenantId } }] },
      overrideAccess: true,
      req,
    })
    const campaign = campaignRes.docs[0]

    if (!campaign) {
      throw new Error(`Campaña ${campaignId} no encontrada para el tenant ${tenantId}`)
    }

    const segmentId =
      typeof campaign.segment === 'object' && campaign.segment ? campaign.segment.id : campaign.segment

    // Fuente única de destinatarios: mismas reglas que el conteo del editor
    // (segmento, opt-out, conversión, tope 500, dedupe por email).
    const recipients = await collectCampaignRecipients({
      payload: req.payload,
      tenantId,
      segmentId: segmentId || undefined,
      req,
    })

    let sent = 0
    let failed = 0

    const recipientList = Array.from(recipients.values())
    const allEmails = recipientList.map((r) => r.email.toLowerCase())

    // Idempotencia en bulk: una sola consulta para todos los destinatarios
    const alreadySentSet = new Set<string>()
    if (allEmails.length > 0) {
      const alreadySentRes = await req.payload.find({
        collection: 'email-log',
        where: {
          and: [
            { to: { in: allEmails } },
            { campaign: { equals: campaignId } },
            { status: { in: ['sent', 'delivered'] } },
          ],
        },
        limit: allEmails.length,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const doc of alreadySentRes.docs) {
        if (doc.to) alreadySentSet.add(doc.to.toLowerCase())
      }
    }

    const pendingRecipients = recipientList.filter(
      (r) => !alreadySentSet.has(r.email.toLowerCase()),
    )

    // Enviar en lotes concurrentes controlados para evitar N round-trips secuenciales
    const BATCH_SIZE = 15
    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (recipient) => {
          const html = renderEmailHtml({
            title: campaign.subject,
            preheader: campaign.preheader ?? undefined,
            bodyHtml: campaign.bodyHtml.replaceAll('{{nombre}}', firstName(recipient.name)),
          })

          try {
            const result = (await req.payload.sendEmail({
              to: recipient.email,
              subject: campaign.subject,
              html,
            })) as { id?: string } | null | undefined

            await req.payload.create({
              collection: 'email-log',
              data: {
                to: recipient.email,
                subject: campaign.subject,
                status: 'sent',
                source: 'campaign',
                providerMessageId: result?.id,
                campaign: campaign.id,
                ...(recipient.leadId ? { lead: recipient.leadId } : {}),
                ...(recipient.clientId ? { client: recipient.clientId } : {}),
                tenant: tenantId,
              },
              overrideAccess: true,
              req,
            })
            sent += 1
          } catch (err) {
            const message = err instanceof Error ? err.message : 'error desconocido'
            await req.payload.create({
              collection: 'email-log',
              data: {
                to: recipient.email,
                subject: campaign.subject,
                status: 'failed',
                source: 'campaign',
                error: message.slice(0, 1000),
                campaign: campaign.id,
                ...(recipient.leadId ? { lead: recipient.leadId } : {}),
                ...(recipient.clientId ? { client: recipient.clientId } : {}),
                tenant: tenantId,
              },
              overrideAccess: true,
              req,
            })
            failed += 1
          }
        }),
      )
    }

    const finalStatus = sent > 0 && failed > 0 ? 'partial' : sent > 0 ? 'sent' : 'failed'
    await req.payload.update({
      collection: 'email-campaigns',
      id: campaign.id,
      data: {
        status: finalStatus,
        sentCount: sent,
        sentAt: new Date().toISOString(),
      },
      overrideAccess: true,
      req,
    })

    return { output: { sent, failed } }
  },
}
