import crypto from 'crypto'
import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'
import { checkRateLimitDistributed } from './rateLimit'

interface OpenBSPEntity {
  id: string
  organization_id?: string
  conversation_id?: string
  external_id?: string | null
  service?: string
  organization_address?: string
  conversation_address?: string
  sender_address?: string | null
  content?: Record<string, unknown>
  status?: Record<string, unknown> | null
  timestamp?: string
  contact_address?: string
  [key: string]: unknown
}

interface Envelope {
  entity?: string
  action?: string
  data?: OpenBSPEntity
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

async function resolveTenant(
  req: PayloadRequest,
  orgId?: string,
  phoneNumberId?: string,
): Promise<Tenant | null> {
  if (orgId) {
    const byOrg = await req.payload.find({
      collection: 'tenants',
      where: { openbspOrganizationId: { equals: orgId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (byOrg.docs[0]) return byOrg.docs[0]
  }

  if (phoneNumberId) {
    const byPhone = await req.payload.find({
      collection: 'tenants',
      where: { openbspPhoneNumberId: { equals: phoneNumberId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (byPhone.docs[0]) return byPhone.docs[0]
  }

  // Bootstrap mono-tenant: si hay exactamente un tenant, es nuestro
  const all = await req.payload.find({ collection: 'tenants', limit: 2, depth: 0, overrideAccess: true, req })
  if (all.totalDocs === 1) {
    req.payload.logger.warn({
      msg: 'openbsp: resolved tenant via single-tenant fallback. Map openbspOrganizationId or openbspPhoneNumberId on Tenant for multi-tenant isolation.',
    })
    return all.docs[0]
  }
  return null
}

const digits = (v: string | undefined | null): string => (v ?? '').replace(/\D/g, '')

async function matchContact(
  req: PayloadRequest,
  tenantId: number,
  phone: string | undefined,
): Promise<{ client?: number; lead?: number }> {
  const p = digits(phone)
  if (!p) return {}
  const suffix = p.slice(-10)

  for (const collection of ['clients', 'leads'] as const) {
    const exact = await req.payload.find({
      collection,
      where: { and: [{ phone: { equals: p } }, { tenant: { equals: tenantId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (exact.docs[0]) {
      return collection === 'clients' ? { client: exact.docs[0].id } : { lead: exact.docs[0].id }
    }
    const loose = await req.payload.find({
      collection,
      where: { and: [{ phone: { like: suffix } }, { tenant: { equals: tenantId } }] },
      limit: 2,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (loose.docs.length === 1) {
      return collection === 'clients' ? { client: loose.docs[0].id } : { lead: loose.docs[0].id }
    }
  }
  return {}
}

async function upsertConversation(
  req: PayloadRequest,
  tenant: Tenant,
  data: OpenBSPEntity,
): Promise<number> {
  if (!data.conversation_id) throw new Error('conversation_id faltante')

  const existing = await req.payload.find({
    collection: 'conversations',
    where: { and: [{ openbspId: { equals: data.conversation_id } }, { tenant: { equals: tenant.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const isInbound = Boolean(data.sender_address)
  const patch = {
    channel: (data.service as 'whatsapp' | 'instagram_dm' | 'whatsapp_web') || 'whatsapp',
    organizationAddress: data.organization_address ?? '',
    lastMessageAt: data.timestamp ?? new Date().toISOString(),
    ...(isInbound ? { lastInboundAt: data.timestamp ?? new Date().toISOString() } : {}),
  }

  if (existing.docs[0]) {
    const conv = existing.docs[0]
    const patchWithLink: typeof patch & { client?: number; lead?: number } = { ...patch }
    if (!conv.client && !conv.lead) {
      const relink = await matchContact(req, tenant.id, digits(conv.contactAddress))
      Object.assign(patchWithLink, relink)
    }
    await req.payload.update({
      collection: 'conversations',
      id: conv.id,
      data: patchWithLink,
      overrideAccess: true,
      req,
    })
    return conv.id
  }

  const contactPhone = digits(data.conversation_address || data.sender_address)
  const match = await matchContact(req, tenant.id, contactPhone)

  const created = await req.payload.create({
    collection: 'conversations',
    data: {
      openbspId: data.conversation_id,
      contactAddress: contactPhone || (data.conversation_address ?? ''),
      ...patch,
      ...match,
      tenant: tenant.id,
    },
    overrideAccess: true,
    req,
  })
  return created.id
}

async function handleMessage(req: PayloadRequest, action: string, data: OpenBSPEntity): Promise<Response> {
  const tenant = await resolveTenant(req, data.organization_id, data.organization_address)
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
  const knownKinds = [
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
  const type: (typeof knownKinds)[number] | 'unknown' = (knownKinds as readonly string[]).includes(
    kind,
  )
    ? (kind as (typeof knownKinds)[number])
    : 'unknown'

  const created = await req.payload.create({
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

  void created
  return json({ ok: true, created: true })
}

async function enrichContact(
  req: PayloadRequest,
  tenant: Tenant,
  data: OpenBSPEntity,
): Promise<Response> {
  // contacts_addresses trae el teléfono; contacts trae display_name en extra
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

  let envelope: Envelope
  const readJson = req.json
  if (typeof readJson !== 'function') return json({ error: 'Cuerpo requerido' }, 400)
  try {
    envelope = (await readJson.call(req)) as Envelope
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
        // v1: las conversaciones se materializan solas al llegar mensajes
        return json({ ok: true, ignored: 'conversations se manejan vía messages' })
      case 'organizations_addresses':
        return json({ ok: true, ignored: 'cuentas conectadas: fase SaaS futura' })
      case 'contacts': {
        const tenant = await resolveTenant(
          req,
          envelope.data.organization_id,
          envelope.data.organization_address,
        )
        if (!tenant) return json({ ok: true, ignored: 'organización sin mapear a tenant' })
        return await enrichContact(req, tenant, envelope.data)
      }
      case 'contacts_addresses': {
        const tenant = await resolveTenant(
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
