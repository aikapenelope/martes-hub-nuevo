import type { PayloadRequest } from 'payload'
import type { EmailCampaign, User } from '@/payload-types'
import { renderEmailHtml } from '../email/layout'

const EDITOR_ROLES = ['admin', 'agente']
const MAX_RECIPIENTS = 200

interface Recipient {
  email: string
  name: string
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

export async function sendCampaignHandler(req: PayloadRequest): Promise<Response> {
  const user = req.user as User | null
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.roles?.some((r) => EDITOR_ROLES.includes(r))) {
    return Response.json({ error: 'Requiere rol admin o agente' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json(
      { error: 'Email no configurado (falta RESEND_API_KEY)' },
      { status: 503 },
    )
  }

  const campaignId = Number((req.routeParams as Record<string, unknown> | undefined)?.id)
  if (!Number.isInteger(campaignId)) {
    return Response.json({ error: 'id de campaña inválido' }, { status: 400 })
  }

  const campaign = (await req.payload.findByID({
    collection: 'email-campaigns',
    id: campaignId,
    depth: 1,
    overrideAccess: false,
    user,
  })) as unknown as EmailCampaign
  if (!campaign) return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })

  const rawTenant = campaign.tenant
  const tenantId = typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant
  if (!tenantId) return Response.json({ error: 'Campaña sin tenant' }, { status: 422 })
  if (campaign.status === 'sending') {
    return Response.json({ error: 'La campaña ya está en envío' }, { status: 409 })
  }
  if (campaign.status === 'sent' || campaign.status === 'partial') {
    return Response.json({ error: 'La campaña ya fue enviada' }, { status: 409 })
  }

  const segmentId =
    typeof campaign.segment === 'object' && campaign.segment ? campaign.segment.id : campaign.segment

  const recipients = new Map<string, Recipient>()

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
      limit: MAX_RECIPIENTS,
      depth: 0,
      overrideAccess: true,
    })
    for (const lead of leads.docs) {
      if (lead.email) recipients.set(lead.email.toLowerCase(), { email: lead.email, name: lead.fullName })
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
      limit: MAX_RECIPIENTS,
      depth: 0,
      overrideAccess: true,
    })
    for (const client of clients.docs) {
      if (client.email) recipients.set(client.email.toLowerCase(), { email: client.email, name: client.name })
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
      limit: MAX_RECIPIENTS,
      depth: 0,
      overrideAccess: true,
    })
    for (const lead of leads.docs) {
      if (lead.email) recipients.set(lead.email.toLowerCase(), { email: lead.email, name: lead.fullName })
    }
  }

  const list = [...recipients.values()].slice(0, MAX_RECIPIENTS)
  if (list.length === 0) {
    return Response.json({ error: 'Sin destinatarios para esta campaña' }, { status: 422 })
  }

  await req.payload.update({
    collection: 'email-campaigns',
    id: campaign.id,
    data: { status: 'sending' },
    overrideAccess: true,
  })

  let sent = 0
  let failed = 0

  for (const recipient of list) {
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
      })
      failed += 1
    }
  }

  const finalStatus = sent > 0 && failed > 0 ? 'partial' : sent > 0 ? 'sent' : 'failed'
  const updated = await req.payload.update({
    collection: 'email-campaigns',
    id: campaign.id,
    data: {
      status: finalStatus,
      sentCount: sent,
      sentAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  void updated
  return Response.json({ ok: true, sent, failed, total: list.length })
}
