import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'

export interface OpenBSPEntity {
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

export interface OpenBSPEnvelope {
  entity?: string
  action?: string
  data?: OpenBSPEntity
}

export const digits = (v: string | undefined | null): string => (v ?? '').replace(/\D/g, '')

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  whatsapp_web: 'WhatsApp',
}

export async function resolveOpenBSPTenant(
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

export async function matchContact(
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

export async function autoCreateLeadFromContact(
  req: PayloadRequest,
  tenant: Tenant,
  phone: string,
  channel: string,
): Promise<number> {
  const label = CHANNEL_LABEL[channel] ?? 'WhatsApp'
  const source = channel === 'instagram_dm' ? 'instagram_dm' : 'whatsapp'

  const lead = await req.payload.create({
    collection: 'leads',
    data: {
      fullName: `${label} +${phone}`,
      phone,
      status: 'nuevo',
      source,
      tenant: tenant.id,
    },
    overrideAccess: true,
    req,
  })

  await req.payload.create({
    collection: 'activities',
    data: {
      tenant: tenant.id,
      type: channel === 'instagram_dm' ? 'otro' : 'whatsapp',
      occurredAt: new Date().toISOString(),
      summary: `Lead creado automáticamente por mensaje entrante de ${label}`,
      lead: lead.id,
    },
    overrideAccess: true,
    req,
  })

  return lead.id
}

export async function matchOrCreateLead(
  req: PayloadRequest,
  tenant: Tenant,
  phone: string,
  channel: string,
  isInbound: boolean,
): Promise<{ client?: number; lead?: number }> {
  const match = await matchContact(req, tenant.id, phone)
  if (match.client || match.lead || !isInbound || !phone) return match
  const leadId = await autoCreateLeadFromContact(req, tenant, phone, channel)
  return { lead: leadId }
}

export async function upsertConversation(
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
      const relink = await matchOrCreateLead(req, tenant, digits(conv.contactAddress), patch.channel, isInbound)
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
  const match = await matchOrCreateLead(req, tenant, contactPhone, patch.channel, isInbound)

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
