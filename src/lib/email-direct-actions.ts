'use server'

import { revalidatePath } from 'next/cache'

import { renderEmailHtml } from '@/email/layout'
import { renderMarkdownToSafeHtml } from '@/email/markdown'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
import { getScopedClient, getScopedLead } from '@/lib/crm-scoped-entities'
import { getWorkspaceContext } from '@/lib/workspace-context'

type WorkspaceContext = Awaited<ReturnType<typeof getWorkspaceContext>>

interface ResolvedRecipient {
  context: WorkspaceContext
  to: string
  leadId?: number
  clientId?: number
}

/**
 * Resuelve el destinatario del formulario (`lead_<id>` | `client_<id>`)
 * dentro del tenant activo. Los helpers scoped lanzan si el registro no
 * pertenece al tenant, así que un ID forjado desde otro tenant nunca llega
 * a enviarse ni a registrarse.
 */
async function resolveRecipient(recipientRaw: string): Promise<ResolvedRecipient> {
  const isLead = recipientRaw.startsWith('lead_')
  const id = Number(recipientRaw.split('_')[1])
  if (!Number.isInteger(id) || id <= 0) throw new Error('Destinatario inválido')

  const scoped = isLead ? await getScopedLead(id) : await getScopedClient(id)
  const record = 'lead' in scoped ? scoped.lead : scoped.client
  const email = record.email?.trim()
  if (!email) {
    throw new Error(isLead ? 'El lead no tiene email registrado' : 'El cliente no tiene email registrado')
  }

  return {
    context: scoped.context,
    to: email,
    ...(isLead ? { leadId: id } : { clientId: id }),
  }
}

/** Registra el intento en `email-log` (estado sent o failed). A diferencia de `messages`, `email-log` permite `create` a editores (ver `EmailLog.ts`). */
async function logEmail(
  context: WorkspaceContext,
  entry: {
    to: string
    subject: string
    status: 'sent' | 'failed'
    providerMessageId?: string
    error?: string
    leadId?: number
    clientId?: number
  },
) {
  await context.payload.create({
    collection: 'email-log',
    overrideAccess: false,
    user: context.user,
    data: {
      to: entry.to,
      subject: entry.subject,
      status: entry.status,
      source: 'transactional',
      ...(entry.providerMessageId ? { providerMessageId: entry.providerMessageId } : {}),
      ...(entry.error ? { error: entry.error.slice(0, 1000) } : {}),
      ...(entry.leadId ? { lead: entry.leadId } : {}),
      ...(entry.clientId ? { client: entry.clientId } : {}),
      tenant: context.tenantId,
    },
  })
}

/**
 * Envía un correo 1:1 desde el hub de email, vía el adapter oficial de
 * Resend (`payload.sendEmail`, ya configurado en `payload.config.ts`).
 * Mismo flujo que `sendLeadEmailAction` en `crm-pipeline-actions.ts`:
 * rate limit, resolución del destinatario scoped al tenant, envío real y
 * registro en `email-log` — la actividad de timeline se crea solo si el
 * envío tuvo éxito.
 */
export async function sendDirectEmailAction(formData: FormData) {
  const recipientRaw = String(formData.get('recipientId') ?? '')
  const subjectRaw = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!recipientRaw || !subjectRaw || !body) throw new Error('Faltan campos requeridos')

  const { context, to, leadId, clientId } = await resolveRecipient(recipientRaw)
  if (!context.canEdit) throw new Error('No tienes permiso para enviar correos')
  if (!(await checkUserActionRateLimit(context.user.id, 'send-email'))) {
    throw new Error('Demasiados correos seguidos — espera un minuto e intenta de nuevo')
  }
  if (!process.env.RESEND_API_KEY) throw new Error('Email no configurado (falta RESEND_API_KEY)')

  const subject = subjectRaw.slice(0, 200)
  // El cuerpo se trata SIEMPRE como texto/Markdown, nunca como HTML: se
  // escapa entero antes de entrar al layout, así que ningún editor puede
  // inyectar markup engañoso ni tracking bajo la identidad del remitente.
  const safeBodyHtml = renderMarkdownToSafeHtml(body)

  let providerMessageId: string | undefined
  try {
    const html = renderEmailHtml({ title: subject, bodyHtml: safeBodyHtml })
    const result = (await context.payload.sendEmail({ to, subject, html })) as { id?: string } | null | undefined
    providerMessageId = result?.id
  } catch (err) {
    // El proveedor falló: el email NO salió — se registra el intento y se
    // propaga para que el usuario pueda reintentar sin riesgo de duplicado.
    const message = err instanceof Error ? err.message : 'Error enviando el correo'
    await logEmail(context, { to, subject, status: 'failed', error: message, leadId, clientId }).catch(() => undefined)
    throw new Error(message)
  }

  // El email YA SALIÓ del proveedor: un fallo de contabilidad (email-log o
  // activities) no debe presentarse como envío fallido — el usuario
  // reintentaría y el cliente recibiría el correo dos veces. Se registra en
  // logs con el providerMessageId para conciliar por fuera.
  try {
    await logEmail(context, { to, subject, status: 'sent', providerMessageId, leadId, clientId })

    await context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        type: 'email',
        occurredAt: new Date().toISOString(),
        summary: `Email enviado: "${subject}"`,
        ...(leadId ? { lead: leadId } : {}),
        ...(clientId ? { client: clientId } : {}),
      },
    })
  } catch (err) {
    console.error('[EMAIL 1:1] Enviado pero sin registro completo (email-log/activities):', {
      to,
      subject,
      providerMessageId,
      error: err instanceof Error ? err.message : err,
    })
  }

  revalidatePath('/workspace/email')
  revalidatePath('/workspace/crm')
  revalidatePath('/workspace/activities')
}
