import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'

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

async function resolveTenant(req: PayloadRequest, orgId?: string): Promise<Tenant | null> {
  if (orgId) {
    const byOrg = await req.payload.find({
      collection: 'tenants',
      where: { openbspOrganizationId: { equals: orgId } },
      limit: 1,
      depth: 0,
    })
    if (byOrg.docs[0]) return byOrg.docs[0]
  }
  // Bootstrap mono-tenant: si hay exactamente un tenant, es nuestro
  const all = await req.payload.find({ collection: 'tenants', limit: 2, depth: 0 })
  if (all.totalDocs === 1) return all.docs[0]
  return null
}

const digits = (v: string | undefined | null): string => (v ?? '').replace(/\D/g, '')

async function matchContact(
  req: PayloadRequest,
  tenantId: number,
  phone: string | undefined,
): Promise<{ clientId?: number; leadId?: number }> {
  const p = digits(phone)
  if (!p) return {}
  const suffix = p.slice(-10)

  for (const collection of ['clients', 'leads'] as const) {
    const exact = await req.payload.find({
      collection,
      where: { and: [{ phone: { equals: p } }, { tenant: { equals: tenantId } }] },
      limit: 1,
      depth: 0,
    })
    if (exact.docs[0]) {
      return collection === 'clients' ? { clientId: exact.docs[0].id } : { leadId: exact.docs[0].id }
    }
    const loose = await req.payload.find({
      collection,
      where: { and: [{ phone: { like: suffix } }, { tenant: { equals: tenantId } }] },
      limit: 2,
      depth: 0,
    })
    if (loose.docs.length === 1) {
      return collection === 'clients'
        ? { clientId: loose.docs[0].id }
        : { leadId: loose.docs[0].id }
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
  })

  const isInbound = Boolean(data.sender_address)
  const patch = {
    channel: (data.service as 'whatsapp' | 'instagram_dm' | 'whatsapp_web') || 'whatsapp',
    organizationAddress: data.organization_address ?? '',
    lastMessageAt: data.timestamp ?? new Date().toISOString(),
    ...(isInbound ? { lastInboundAt: data.timestamp ?? new Date().toISOString() } : {}),
  }

  if (existing.docs[0]) {
    await req.payload.update({
      collection: 'conversations',
      id: existing.docs[0].id,
      data: patch,
      overrideAccess: true,
    })
    return existing.docs[0].id
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
  })
  return created.id
}

async function handleMessage(req: PayloadRequest, action: string, data: OpenBSPEntity): Promise<Response> {
  const tenant = await resolveTenant(req, data.organization_id)
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
  })

  const row = existing.docs[0]
  if (row && action === 'update') {
    await req.payload.update({
      collection: 'messages',
      id: row.id,
      data: { statusJson: data.status ?? {} },
      overrideAccess: true,
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
  })

  void created
  return json({ ok: true, created: true })
}

export async function openbspWebhookHandler(req: PayloadRequest): Promise<Response> {
  const expected = process.env.OPENBSP_WEBHOOK_TOKEN
  if (!expected) return json({ error: 'Webhook no configurado (falta OPENBSP_WEBHOOK_TOKEN)' }, 503)

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) return json({ error: 'No autorizado' }, 401)

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
      case 'contacts':
      case 'contacts_addresses':
      case 'logs':
        return json({ ok: true, ignored: `${envelope.entity} pendiente de fase F3d` })
      default:
        return json({ ok: true, ignored: `entidad desconocida: ${envelope.entity}` })
    }
  } catch (err) {
    req.payload.logger.error({ msg: 'openbsp webhook error', err: err instanceof Error ? err.message : err })
    return json({ error: 'Error procesando webhook' }, 500)
  }
}
