import crypto from 'crypto'
import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'

export interface TallyField {
  key: string
  label?: string
  type?: string
  value?: unknown
  options?: Array<{ id: string; text: string }>
}

export interface TallyEventData {
  responseId?: string
  submissionId?: string
  respondentId?: string
  formId?: string
  formName?: string
  createdAt?: string
  fields?: TallyField[]
  [key: string]: unknown
}

export interface TallyEnvelope {
  eventId?: string
  eventType?: string
  createdAt?: string
  data?: TallyEventData
}

export function digits(v: string | undefined | null): string {
  return (v ?? '').replace(/\D/g, '')
}

export function verifyTallySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false
  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(rawBody).digest('base64')
    const a = Buffer.from(digest)
    const b = Buffer.from(signatureHeader)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function timingSafeEqual(a: string | null, b: string): boolean {
  if (!a) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function resolveTallyTenant(req: PayloadRequest, explicitTenantId?: number | null): Promise<Tenant | null> {
  if (explicitTenantId) {
    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: explicitTenantId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (tenant) return tenant
  }

  const all = await req.payload.find({ collection: 'tenants', limit: 2, depth: 0, overrideAccess: true, req })
  if (all.totalDocs === 1) {
    req.payload.logger.warn({
      msg: 'tally: resolved tenant via single-tenant fallback. Map ?tenant=ID in webhook URL or form hidden field for multi-tenant isolation.',
    })
    return all.docs[0]
  }
  return null
}

const COMPLAINT_KEYWORDS = [
  'queja',
  'reclamo',
  'malo',
  'pésimo',
  'pesimo',
  'terrible',
  'inconforme',
  'estafa',
  'decepción',
  'decepcion',
  'urgente',
  'cancelar',
  'devolución',
  'devolucion',
]

export interface ParsedTallyFields {
  respondentName: string
  respondentEmail: string
  respondentPhone: string
  explicitTenantId: number | null
  isComplaint: boolean
  answersRecord: Record<string, unknown>
}

export function parseTallyFields(fields: TallyField[]): ParsedTallyFields {
  let respondentName = ''
  let respondentEmail = ''
  let respondentPhone = ''
  let explicitTenantId: number | null = null
  let isComplaint = false
  const answersRecord: Record<string, unknown> = {}

  for (const field of fields) {
    const label = (field.label || field.key || '').trim()
    const val = field.value

    if (val !== undefined && val !== null) {
      answersRecord[label || field.key] = val
    }

    const labelLower = label.toLowerCase()
    const valStr = typeof val === 'string' ? val.trim() : ''

    if (labelLower.includes('nombre') || labelLower.includes('name')) {
      if (!respondentName && valStr) respondentName = valStr
    }
    if (
      field.type === 'INPUT_EMAIL' ||
      labelLower.includes('email') ||
      labelLower.includes('correo')
    ) {
      if (!respondentEmail && valStr && valStr.includes('@')) {
        respondentEmail = valStr.toLowerCase()
      }
    }
    if (
      field.type === 'INPUT_PHONE_NUMBER' ||
      labelLower.includes('teléfono') ||
      labelLower.includes('telefono') ||
      labelLower.includes('whatsapp') ||
      labelLower.includes('phone')
    ) {
      if (!respondentPhone && valStr) {
        respondentPhone = digits(valStr)
      }
    }
    if (labelLower === 'tenant' || labelLower === 'tenant_id') {
      const parsed = Number(val)
      if (Number.isInteger(parsed)) explicitTenantId = parsed
    }

    // Detección de quejas o bajo NPS
    if (valStr) {
      const valLower = valStr.toLowerCase()
      if (COMPLAINT_KEYWORDS.some((kw) => valLower.includes(kw))) {
        isComplaint = true
      }
    }
    if (
      (labelLower.includes('nps') ||
        labelLower.includes('satisfacción') ||
        labelLower.includes('calificación')) &&
      typeof val === 'number' &&
      val <= 6
    ) {
      isComplaint = true
    }
  }

  return {
    respondentName,
    respondentEmail,
    respondentPhone,
    explicitTenantId,
    isComplaint,
    answersRecord,
  }
}

export async function resolveOrCreateTallyContact(
  req: PayloadRequest,
  tenant: Tenant,
  contact: { name: string; email: string; phone: string; formName: string },
): Promise<{ clientId?: number; leadId?: number }> {
  let clientId: number | undefined
  let leadId: number | undefined

  // 1. Intentar matching con cliente existente
  if (contact.email || contact.phone) {
    const clients = await req.payload.find({
      collection: 'clients',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          {
            or: [
              ...(contact.email ? [{ email: { equals: contact.email } }] : []),
              ...(contact.phone ? [{ phone: { equals: contact.phone } }] : []),
            ],
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (clients.docs[0]) {
      clientId = clients.docs[0].id
    }
  }

  // 2. Si no es cliente, buscar lead existente o crearlo
  if (!clientId && (contact.email || contact.phone || contact.name)) {
    const leads = await req.payload.find({
      collection: 'leads',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          {
            or: [
              ...(contact.email ? [{ email: { equals: contact.email } }] : []),
              ...(contact.phone ? [{ phone: { equals: contact.phone } }] : []),
            ],
          },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (leads.docs[0]) {
      leadId = leads.docs[0].id
    } else {
      const createdLead = await req.payload.create({
        collection: 'leads',
        data: {
          fullName: contact.name || contact.email || contact.phone || 'Lead Formulario',
          email: contact.email || undefined,
          phone: contact.phone || undefined,
          source: 'tally',
          status: 'nuevo',
          notes: `Generado automáticamente por envío de formulario "${contact.formName}"`,
          tenant: tenant.id,
        },
        overrideAccess: true,
        req,
      })
      leadId = createdLead.id
    }
  }

  return { clientId, leadId }
}
