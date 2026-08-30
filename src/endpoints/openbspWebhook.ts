import crypto from 'crypto'
import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'
import { checkRateLimitDistributed } from './rateLimit'
import {
  digits,
  resolveOpenBSPTenant,
  upsertConversation,
  type OpenBSPEntity,
  type OpenBSPEnvelope,
} from '@/integrations/openbsp/webhook-helpers'

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

const KNOWN_KINDS = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'template',
  'location',
  'contacts',
] as const

type KnownKind = (typeof KNOWN_KINDS)[number]

async function handleMessage(req: PayloadRequest, action: string, data: OpenBSPEntity): Promise<Response> {
  const tenant = await resolveOpenBSPTenant(req, data.organization_id, data.organization_address)
  if (!tenant) return json({ ok: true, ignored: 'organización sin mapear a tenant' })

  // Idempotencia por uuid OpenBSP o WAMID
  const existing = await req.payload.find({
    collection: 'messages',
    where: {
      and: [
        { tenant: { equals: tenant.id } },
        { or: [{ openbspId: { equals: data.id } }, ...(data.external_id ? [{ externalId: { equals: data.external_id } }] : [])] },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const row = existing.docs[0]
  if (row && action === 'update') {
    await req.payload.update({
      collection: 'messages',
      id: row.id,
      data: { statusJson: data.status ?? {} },
      overrideAccess: true,
      req,
    })
    return json({ ok: true, merged: true })
  }
  if (row) return json({ ok: true, duplicate: true })

  const conversationId = await upsertConversation(req, tenant, data)
  const content = data.content ?? {}
  const kind = String(content.kind ?? content.type ?? 'unknown')
  const type: KnownKind | 'unknown' = (KNOWN_KINDS as readonly string[]).includes(kind)
    ? (kind as KnownKind)
    : 'unknown'

  await req.payload.create({
    collection: 'messages',
    data: {
      conversation: conversationId,
      direction: data.sender_address ? 'inbound' : 'outbound',
      openbspId: data.id,
      externalId: data.external_id ?? undefined,
      type,
      text: typeof content.text === 'string' ? content.text : undefined,
      content,
      statusJson: data.status ?? {},
      senderAddress: data.sender_address ?? undefined,
      sentAt: data.timestamp ?? new Date().toISOString(),
      tenant: tenant.id,
    },
    overrideAccess: true,
    req,
  })

  return json({ ok: true, created: true })
}

async function enrichContact(
  req: PayloadRequest,
  tenant: Tenant,
  data: OpenBSPEntity,
): Promise<Response> {
  const phone = digits(data.contact_address ?? data.conversation_address ?? '')
  const extra = (data.extra ?? {}) as Record<string, unknown>
  const displayName =
    typeof extra.display_name === 'string' && extra.display_name.trim()
      ? extra.display_name.trim()
      : typeof data.display_name === 'string'
        ? data.display_name.trim()
        : ''
  if (!phone || !displayName) return json({ ok: true, ignored: 'sin teléfono o nombre' })

  const p10 = phone.slice(-10)
  const clients = await req.payload.find({
    collection: 'clients',
    where: {
      and: [
        { or: [{ phone: { equals: phone } }, { phone: { like: p10 } }] },
        { tenant: { equals: tenant.id } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const client = clients.docs[0]
  if (!client) return json({ ok: true, ignored: 'sin cliente asociado al teléfono' })

  if (client.name && client.name !== client.phone) {
    return json({ ok: true, ignored: 'cliente ya tiene nombre' })
  }
  await req.payload.update({
    collection: 'clients',
    id: client.id,
    data: { name: displayName },
    overrideAccess: true,
    req,
  })
  return json({ ok: true, enriched: true })
}

export async function openbspWebhookHandler(req: PayloadRequest): Promise<Response> {
  const expected = process.env.OPENBSP_WEBHOOK_TOKEN
  if (!expected) return json({ error: 'Webhook no configurado (falta OPENBSP_WEBHOOK_TOKEN)' }, 503)

  if (!(await checkRateLimitDistributed(req, 'openbsp-webhook'))) {
    return json({ error: 'Demasiadas peticiones' }, 429)
  }

  // Comparación timing-safe del token para evitar ataques de timing
  const authHeader = req.headers.get('authorization') ?? ''
  const isBearerValid = (() => {
    if (!authHeader.startsWith('Bearer ')) return false
    const provided = Buffer.from(authHeader.slice(7))
    const secret = Buffer.from(expected)
    if (provided.length !== secret.length) return false
    return crypto.timingSafeEqual(provided, secret)
  })()
  if (!isBearerValid) return json({ error: 'No autorizado' }, 401)

  const readJson = req.json
  if (typeof readJson !== 'function') return json({ error: 'Cuerpo requerido' }, 400)
  let envelope: OpenBSPEnvelope
  try {
    envelope = (await readJson.call(req)) as OpenBSPEnvelope
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  if (!envelope.entity || !envelope.action || !envelope.data?.id) {
    return json({ error: 'Envelope inválido' }, 400)
  }

  try {
    switch (envelope.entity) {
      case 'messages':
        return await handleMessage(req, envelope.action, envelope.data)
      case 'conversations':
        return json({ ok: true, ignored: 'conversations se manejan vía messages' })
      case 'organizations_addresses':
        return json({ ok: true, ignored: 'cuentas conectadas: fase SaaS futura' })
      case 'contacts':
      case 'contacts_addresses': {
        const tenant = await resolveOpenBSPTenant(
          req,
          envelope.data.organization_id,
          envelope.data.organization_address,
        )
        if (!tenant) return json({ ok: true, ignored: 'organización sin mapear a tenant' })
        return await enrichContact(req, tenant, envelope.data)
      }
      case 'logs':
        return json({ ok: true, ignored: 'los logs se poll-ean por job openbsp-error-poll' })
      default:
        return json({ ok: true, ignored: `entidad desconocida: ${envelope.entity}` })
    }
  } catch (err) {
    req.payload.logger.error({ msg: 'openbsp webhook error', err })
    return json({ error: 'Error procesando webhook' }, 500)
  }
}
