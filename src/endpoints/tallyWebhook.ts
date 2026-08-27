import crypto from 'crypto'
import type { PayloadRequest } from 'payload'
import type { Tenant } from '@/payload-types'

interface TallyField {
  key: string
  label?: string
  type?: string
  value?: unknown
  options?: Array<{ id: string; text: string }>
}

interface TallyEventData {
  responseId?: string
  submissionId?: string
  respondentId?: string
  formId?: string
  formName?: string
  createdAt?: string
  fields?: TallyField[]
  [key: string]: unknown
}

interface TallyEnvelope {
  eventId?: string
  eventType?: string
  createdAt?: string
  data?: TallyEventData
}

function digits(v: string | undefined | null): string {
  return (v ?? '').replace(/\D/g, '')
}

function verifyTallySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false
  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(rawBody).digest('base64')
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader))
  } catch {
    return false
  }
}

async function resolveTenant(req: PayloadRequest, explicitTenantId?: number | null): Promise<Tenant | null> {
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
  if (all.totalDocs === 1) return all.docs[0]
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

export async function tallyWebhookHandler(req: PayloadRequest): Promise<Response> {
  const secret = process.env.TALLY_SIGNING_SECRET || process.env.TALLY_WEBHOOK_SECRET

  const readText = req.text
  if (typeof readText !== 'function') {
    return Response.json({ error: 'Cuerpo requerido' }, { status: 400 })
  }

  let rawBody: string
  try {
    rawBody = await readText.call(req)
  } catch {
    return Response.json({ error: 'Error leyendo el cuerpo de la petición' }, { status: 400 })
  }

  if (secret) {
    const sigHeader = req.headers.get('tally-signature')
    const authHeader = req.headers.get('authorization')
    const url = new URL(req.url ?? 'http://local.payload/api/webhooks/tally')
    const querySecret = url.searchParams.get('secret')

    const isHmacValid = sigHeader ? verifyTallySignature(rawBody, sigHeader, secret) : false
    const isBearerValid = authHeader === `Bearer ${secret}`
    const isQueryValid = querySecret === secret

    if (!isHmacValid && !isBearerValid && !isQueryValid) {
      return Response.json({ error: 'Firma o token de webhook inválido' }, { status: 401 })
    }
  }

  let envelope: TallyEnvelope
  try {
    envelope = JSON.parse(rawBody) as TallyEnvelope
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data = envelope.data
  if (!data) {
    return Response.json({ ok: true, ignored: 'sin datos de respuesta' })
  }

  const formName = data.formName || 'Formulario Tally'
  const formId = data.formId || envelope.eventId || ''
  const fields = Array.isArray(data.fields) ? data.fields : []

  // Extraer campos clave
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

  // Si se envió query param ?tenant=ID
  const url = new URL(req.url ?? 'http://local.payload/api/webhooks/tally')
  const qTenant = url.searchParams.get('tenant')
  if (qTenant && Number.isInteger(Number(qTenant))) {
    explicitTenantId = Number(qTenant)
  }

  const tenant = await resolveTenant(req, explicitTenantId)
  if (!tenant) {
    return Response.json({ error: 'Tenant no resoluble para este formulario' }, { status: 422 })
  }

  let clientId: number | undefined
  let leadId: number | undefined

  // 1. Intentar matching con cliente existente
  if (respondentEmail || respondentPhone) {
    const clients = await req.payload.find({
      collection: 'clients',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          {
            or: [
              ...(respondentEmail ? [{ email: { equals: respondentEmail } }] : []),
              ...(respondentPhone ? [{ phone: { equals: respondentPhone } }] : []),
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
  if (!clientId && (respondentEmail || respondentPhone || respondentName)) {
    const leads = await req.payload.find({
      collection: 'leads',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          {
            or: [
              ...(respondentEmail ? [{ email: { equals: respondentEmail } }] : []),
              ...(respondentPhone ? [{ phone: { equals: respondentPhone } }] : []),
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
          fullName: respondentName || respondentEmail || respondentPhone || 'Lead Formulario',
          email: respondentEmail || undefined,
          phone: respondentPhone || undefined,
          source: 'tally',
          status: 'nuevo',
          notes: `Generado automáticamente por envío de formulario "${formName}"`,
          tenant: tenant.id,
        },
        overrideAccess: true,
        req,
      })
      leadId = createdLead.id
    }
  }

  // 3. Crear el registro en FormSubmissions
  const submission = await req.payload.create({
    collection: 'form-submissions',
    data: {
      formName,
      formId,
      source: 'tally',
      respondentName: respondentName || undefined,
      respondentEmail: respondentEmail || undefined,
      respondentPhone: respondentPhone || undefined,
      client: clientId,
      lead: leadId,
      isComplaint,
      answersJson: answersRecord,
      rawPayload: envelope as unknown as Record<string, unknown>,
      tenant: tenant.id,
    },
    overrideAccess: true,
    req,
  })

  // 4. Si es una queja o feedback negativo, generar alerta en notifications y crear tarea urgente
  if (isComplaint) {
    const person = respondentName || respondentEmail || respondentPhone || 'Usuario anónimo'
    await req.payload.create({
      collection: 'notifications',
      data: {
        title: `[Tally] Queja / Alerta en "${formName}"`,
        body: `Envío de ${person} requiere atención urgente por queja o bajo puntaje de satisfacción.`,
        severity: 'warning',
        source: 'tally',
        read: false,
        tenant: tenant.id,
      },
      overrideAccess: true,
      req,
    })

    await req.payload.create({
      collection: 'tasks',
      data: {
        title: `Resolver queja en "${formName}" (${person})`,
        description: `El cliente/lead reportó una queja o bajo NPS en el formulario "${formName}". Revisar respuestas en el envío #${submission.id}.`,
        status: 'pendiente',
        priority: 'urgente',
        source: 'tally_complaint',
        client: clientId,
        lead: leadId,
        tenant: tenant.id,
      },
      overrideAccess: true,
      req,
    })
  }

  return Response.json({
    ok: true,
    submissionId: submission.id,
    linkedClient: clientId,
    linkedLead: leadId,
    isComplaint,
  })
}
