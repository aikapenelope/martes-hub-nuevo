import { Webhook } from 'svix'
import type { PayloadRequest } from 'payload'

const STATUS_BY_EVENT: Record<string, 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
}

interface ResendEvent {
  type: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string[]
    subject?: string
  }
}

export async function resendWebhookHandler(req: PayloadRequest): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: 'Webhook no configurado (falta RESEND_WEBHOOK_SECRET)' }, { status: 503 })

  const readText = req.text
  if (typeof readText !== 'function') return Response.json({ error: 'Cuerpo requerido' }, { status: 400 })
  const raw = await readText.call(req)

  let event: ResendEvent
  try {
    const wh = new Webhook(secret)
    event = JSON.parse(
      wh.verify(raw, {
        'svix-id': req.headers.get('svix-id') ?? '',
        'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
        'svix-signature': req.headers.get('svix-signature') ?? '',
      }) as string,
    ) as ResendEvent
  } catch {
    return Response.json({ error: 'Firma inválida' }, { status: 401 })
  }

  const status = STATUS_BY_EVENT[event.type]
  if (!status) return Response.json({ ok: true, ignored: `evento no manejado: ${event.type}` })

  const providerMessageId = event.data?.email_id
  if (!providerMessageId) return Response.json({ error: 'email_id faltante' }, { status: 400 })

  const existing = await req.payload.find({
    collection: 'email-log',
    where: { providerMessageId: { equals: providerMessageId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const logRow = existing.docs[0]
  if (!logRow) return Response.json({ ok: true, ignored: 'email no rastreado' })

  await req.payload.update({
    collection: 'email-log',
    id: logRow.id,
    data: {
      status,
      ...(status === 'bounced' || status === 'failed'
        ? { error: `${event.type} reportado por Resend` }
        : {}),
      eventsJson: { lastEvent: event.type, at: event.created_at },
    },
    overrideAccess: true,
    req,
  })

  req.payload.logger.info({ msg: 'resend webhook aplicado', type: event.type, emailLogId: logRow.id })
  return Response.json({ ok: true, updated: logRow.id })
}
