import type { PayloadRequest } from 'payload'
import type { User, Tenant } from '@/payload-types'
import { sendText } from '../integrations/openbsp/client'

const EDITOR_ROLES = ['admin', 'agente']
const WINDOW_MS = 24 * 60 * 60 * 1000

function relId(v: number | { id: number } | null | undefined): number | null {
  if (v == null) return null
  return typeof v === 'object' ? v.id : v
}

export async function replyConversationHandler(req: PayloadRequest): Promise<Response> {
  const user = req.user as User | null
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.roles?.some((r) => EDITOR_ROLES.includes(r))) {
    return Response.json({ error: 'Requiere rol admin o agente' }, { status: 403 })
  }

  let body: { conversationId?: number; text?: string }
  const readJson = req.json
  if (typeof readJson !== 'function') return Response.json({ error: 'Cuerpo requerido' }, { status: 400 })
  try {
    body = (await readJson.call(req)) as typeof body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const conversationId = body.conversationId
  const text = body.text?.trim()
  if (!conversationId || !text) {
    return Response.json({ error: 'conversationId y text son obligatorios' }, { status: 400 })
  }

  // findByID respeta el aislamiento por tenant vía access del plugin multiTenant
  const conversation = await req.payload.findByID({
    collection: 'conversations',
    id: conversationId,
    depth: 1,
    overrideAccess: false,
    user,
  })

  if (!conversation) {
    return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  // Ventana 24h: si el último entrante es más viejo, Meta solo permite plantillas
  if (
    !conversation.lastInboundAt ||
    Date.now() - new Date(conversation.lastInboundAt).getTime() > WINDOW_MS
  ) {
    return Response.json(
      {
        error:
          'Fuera de la ventana de 24h: envía una plantilla aprobada en lugar de texto libre',
        needsTemplate: true,
      },
      { status: 409 },
    )
  }

  const tenantId = relId(conversation.tenant)
  if (!tenantId) return Response.json({ error: 'Conversación sin tenant' }, { status: 422 })

  const tenants = await req.payload.find({
    collection: 'tenants',
    where: { id: { equals: tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const tenant = tenants.docs[0] as Tenant | undefined

  try {
    const row = await sendText({
      to: conversation.contactAddress,
      text,
      tenant: tenant ?? undefined,
    })

    const created = await req.payload.create({
      collection: 'messages',
      data: {
        conversation: conversation.id,
        direction: 'outbound',
        openbspId: row.id,
        externalId: row.external_id ?? undefined,
        type: 'text',
        text,
        content: {},
        statusJson: row.status ?? {},
        sentAt: new Date().toISOString(),
        performedBy: user.id,
        tenant: tenantId,
      },
      overrideAccess: true,
      req,
    })

    await req.payload.update({
      collection: 'conversations',
      id: conversation.id,
      data: { lastMessageAt: new Date().toISOString() },
      overrideAccess: true,
      req,
    })

    return Response.json({ ok: true, messageId: created.id, openbspId: row.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error enviando por OpenBSP'
    const notConfigured = message.startsWith('OpenBSP no configurado')
    req.payload.logger.error({ msg: 'reply falló', err })
    return Response.json({ error: message }, { status: notConfigured ? 503 : 502 })
  }
}
