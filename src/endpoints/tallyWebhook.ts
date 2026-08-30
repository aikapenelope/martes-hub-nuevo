import type { PayloadRequest } from 'payload'
import { checkRateLimitDistributed } from './rateLimit'
import {
  parseTallyFields,
  resolveOrCreateTallyContact,
  resolveTallyTenant,
  timingSafeEqual,
  verifyTallySignature,
  type TallyEnvelope,
} from './tally-helpers'

export async function tallyWebhookHandler(req: PayloadRequest): Promise<Response> {
  const secret = process.env.TALLY_SIGNING_SECRET || process.env.TALLY_WEBHOOK_SECRET

  // La autenticación es OBLIGATORIA: sin secreto configurado, el webhook no procesa nada.
  if (!secret) {
    return Response.json(
      { error: 'Webhook no configurado: falta TALLY_SIGNING_SECRET' },
      { status: 503 },
    )
  }

  const readText = req.text
  if (typeof readText !== 'function') {
    return Response.json({ error: 'Cuerpo requerido' }, { status: 400 })
  }

  if (!(await checkRateLimitDistributed(req, 'tally-webhook'))) {
    return Response.json({ error: 'Demasiadas peticiones' }, { status: 429 })
  }

  let rawBody: string
  try {
    rawBody = await readText.call(req)
  } catch {
    return Response.json({ error: 'Error leyendo el cuerpo de la petición' }, { status: 400 })
  }

  const sigHeader = req.headers.get('tally-signature')
  const authHeader = req.headers.get('authorization')
  const url = new URL(req.url ?? 'http://local.payload/api/webhooks/tally')
  const querySecret = url.searchParams.get('secret')

  const isHmacValid = sigHeader ? verifyTallySignature(rawBody, sigHeader, secret) : false
  const isBearerValid = timingSafeEqual(authHeader, `Bearer ${secret}`)
  const isQueryValid = timingSafeEqual(querySecret, secret)

  if (!isHmacValid && !isBearerValid && !isQueryValid) {
    return Response.json({ error: 'Firma o token de webhook inválido' }, { status: 401 })
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

  const parsed = parseTallyFields(fields)

  // Si se envió query param ?tenant=ID
  const qTenant = url.searchParams.get('tenant')
  const resolvedTenantId =
    qTenant && Number.isInteger(Number(qTenant)) ? Number(qTenant) : parsed.explicitTenantId

  const tenant = await resolveTallyTenant(req, resolvedTenantId)
  if (!tenant) {
    return Response.json({ error: 'Tenant no resoluble para este formulario' }, { status: 422 })
  }

  const { clientId, leadId } = await resolveOrCreateTallyContact(req, tenant, {
    name: parsed.respondentName,
    email: parsed.respondentEmail,
    phone: parsed.respondentPhone,
    formName,
  })

  // 3. Crear el registro en FormSubmissions
  const rawPayload: Record<string, unknown> = typeof envelope === 'object' && envelope !== null ? (envelope as Record<string, unknown>) : {}

  const submission = await req.payload.create({
    collection: 'form-submissions',
    data: {
      formName,
      formId,
      source: 'tally',
      respondentName: parsed.respondentName || undefined,
      respondentEmail: parsed.respondentEmail || undefined,
      respondentPhone: parsed.respondentPhone || undefined,
      client: clientId,
      lead: leadId,
      isComplaint: parsed.isComplaint,
      answersJson: parsed.answersRecord,
      rawPayload,
      tenant: tenant.id,
    },
    overrideAccess: true,
    req,
  })

  // 4. Si es una queja o feedback negativo, generar alerta en notifications y crear tarea urgente
  if (parsed.isComplaint) {
    const person = parsed.respondentName || parsed.respondentEmail || parsed.respondentPhone || 'Usuario anónimo'
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
    isComplaint: parsed.isComplaint,
  })
}
