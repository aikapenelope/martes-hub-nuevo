import type { PayloadRequest } from 'payload'
import { checkRateLimitDistributed } from './rateLimit'
import {
  parseTallyFields,
  resolveOrCreateTallyContact,
  resolveTallyTenant,
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

  // Autenticación SOLO por firma HMAC de Tally sobre el raw body. Se eliminan
  // las alternativas Bearer y ?secret=: el secreto en la query queda en logs
  // de acceso/proxies y es un canal de fuga; la firma nativa de Tally cubre
  // todos los casos legítimos.
  if (!sigHeader || !verifyTallySignature(rawBody, sigHeader, secret)) {
    return Response.json({ error: 'Firma de webhook inválida' }, { status: 401 })
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

  // Idempotencia: la reentrega de un evento Tally no debe crear form-submissions
  // (ni notificaciones/tareas urgentes de queja) duplicadas. Mismo patrón que
  // openbspWebhook con openbspId/externalId.
  const dedupeEventId = envelope.eventId || data.responseId || data.submissionId || ''
  if (dedupeEventId) {
    const dupe = await req.payload.find({
      collection: 'form-submissions',
      where: { eventId: { equals: dedupeEventId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (dupe.docs[0]) {
      return Response.json({ ok: true, duplicate: true, submissionId: dupe.docs[0].id })
    }
  }

  // Si se envió query param ?tenant=ID (solo aislamiento de tenant, nunca de auth)
  const url = new URL(req.url ?? 'http://local.payload/api/webhooks/tally')
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
      eventId: dedupeEventId || undefined,
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
