import type { PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

const EDITOR_ROLES = ['admin', 'agente']

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

  const campaign = await req.payload.findByID({
    collection: 'email-campaigns',
    id: campaignId,
    depth: 0,
    overrideAccess: false,
    user,
    req,
  })

  if (!campaign) return Response.json({ error: 'Campaña no encontrada' }, { status: 404 })

  const rawTenant = campaign.tenant
  const tenantId = typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant
  if (!tenantId) return Response.json({ error: 'Campaña sin tenant' }, { status: 422 })
  if (campaign.status === 'sending') {
    return Response.json({ error: 'La campaña ya está en proceso de envío' }, { status: 409 })
  }
  if (campaign.status === 'sent' || campaign.status === 'partial') {
    return Response.json({ error: 'La campaña ya fue enviada previamente' }, { status: 409 })
  }

  await req.payload.update({
    collection: 'email-campaigns',
    id: campaign.id,
    data: { status: 'sending' },
    overrideAccess: true,
    req,
  })

  await req.payload.jobs.queue({
    task: 'send-campaign-batch',
    input: { campaignId: campaign.id, tenantId: Number(tenantId) },
    overrideAccess: true,
    req,
  })

  return Response.json({ ok: true, queued: true, status: 'sending' }, { status: 202 })
}

