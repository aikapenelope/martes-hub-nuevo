import type { PayloadRequest } from 'payload'
import type { Conversation, User } from '@/payload-types'
import { dispatchConversationReply } from '../lib/message-dispatch'

const EDITOR_ROLES = ['admin', 'agente']

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
  const conversation = (await req.payload.findByID({
    collection: 'conversations',
    id: conversationId,
    depth: 1,
    overrideAccess: false,
    user,
  })) as Conversation | null

  if (!conversation) {
    return Response.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  const tenantId = relId(conversation.tenant)
  if (!tenantId) return Response.json({ error: 'Conversación sin tenant' }, { status: 422 })

  // Despacho unificado (canal + ventana 24h + idempotencia + conciliación)
  const result = await dispatchConversationReply(
    { payload: req.payload, user, tenantId },
    { conversation, text },
  )

  if (!result.ok) {
    if (result.needsTemplate) {
      return Response.json(
        { error: result.error, needsTemplate: true },
        { status: 409 },
      )
    }
    if (result.unsupportedChannel) {
      return Response.json({ error: result.error }, { status: 422 })
    }
    return Response.json({ error: result.error }, { status: result.notConfigured ? 503 : 502 })
  }

  return Response.json({ ok: true, messageId: result.messageId, ...(result.reconcilePending ? { reconcilePending: true } : {}) })
}

