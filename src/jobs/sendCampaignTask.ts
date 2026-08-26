import type { TaskConfig } from 'payload'
import { renderEmailHtml } from '../email/layout'

interface CampaignInput {
  campaignId: number
  tenantId: number
}

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
    const { campaignId, tenantId } = input as unknown as CampaignInput

    const campaign = await req.payload.findByID({
      collection: 'email-campaigns',
      id: campaignId,
      depth: 1,
      overrideAccess: true,
      req,
    })

    if (!campaign) {
      throw new Error(`Campaña ${campaignId} no encontrada`)
    }

    const segmentId =
      typeof campaign.segment === 'object' && campaign.segment ? campaign.segment.id : campaign.segment

    const recipients = new Map<string, { email: string; name: string }>()

    if (segmentId) {
      const leads = await req.payload.find({
        collection: 'leads',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { segment: { equals: segmentId } },
            { status: { not_equals: 'descartado' } },
            { convertedClient: { exists: false } },
            { email: { exists: true } },
          ],
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const lead of leads.docs) {
        if (lead.email) {
          recipients.set(lead.email.toLowerCase(), { email: lead.email, name: lead.fullName })
        }
      }

      const clients = await req.payload.find({
        collection: 'clients',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { segment: { equals: segmentId } },
            { stage: { not_equals: 'perdido' } },
            { optOutAt: { exists: false } },
            { email: { exists: true } },
          ],
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const client of clients.docs) {
        if (client.email) {
          recipients.set(client.email.toLowerCase(), { email: client.email, name: client.name })
        }
      }
    } else {
      const leads = await req.payload.find({
        collection: 'leads',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { status: { not_equals: 'descartado' } },
            { convertedClient: { exists: false } },
            { email: { exists: true } },
          ],
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const lead of leads.docs) {
        if (lead.email) {
          recipients.set(lead.email.toLowerCase(), { email: lead.email, name: lead.fullName })
        }
      }
    }

    let sent = 0
    let failed = 0

    for (const recipient of recipients.values()) {
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
            tenant: tenantId,
          },
          overrideAccess: true,
          req,
        })
        failed += 1
      }
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
