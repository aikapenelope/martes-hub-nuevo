/**
 * Despacho de respuestas por conversación — fuente única de verdad para los
 * tres puntos de envío (inbox, drawer del pipeline, endpoint REST).
 *
 * Encapsula: enrutamiento por canal (solo whatsapp / instagram_dm; whatsapp_web
 * y web se rechazan porque no tienen transporte de salida por API), ventana de
 * 24h de Meta, e idempotencia de despacho (registro `pending:` antes del envío,
 * marcado `dispatched`/`failed` después, conciliación con reintentos) — extraído
 * de replyConversationAction (inbox) para que ninguna ruta reintente duplicando
 * mensajes al contacto.
 */

import { revalidatePath } from 'next/cache'
import type { Payload } from 'payload'
import type { Conversation, Message, Tenant, User } from '@/payload-types'
import { sendText, type OpenBSPMessageRow, type OpenBSPService } from '@/integrations/openbsp/client'

const WINDOW_MS = 24 * 60 * 60 * 1000

/** Canales con transporte de salida real por OpenBSP. Cualquier otro se rechaza. */
const SUPPORTED_CHANNELS: Record<string, OpenBSPService> = {
  whatsapp: 'whatsapp',
  instagram_dm: 'instagram_dm',
}

export interface ConversationReplyContext {
  payload: Payload
  user: User
  tenantId: number
}

export interface ConversationReplyInput {
  conversation: Conversation
  text: string
  idempotencyKey?: string
  /** Rutas a revalidar tras el despacho exitoso (además del refresco del llamador). */
  revalidatePaths?: string[]
}

export interface ConversationReplyOk {
  ok: true
  messageId: number
  reconcilePending?: boolean
}

export interface ConversationReplyFail {
  ok: false
  error: string
  notConfigured?: boolean
  needsTemplate?: boolean
  /** El canal de la conversación no tiene transporte de salida (respuesta 422). */
  unsupportedChannel?: boolean
}

export type ConversationReplyResult = ConversationReplyOk | ConversationReplyFail

/** Resuelve el servicio OpenBSP para un canal de conversación o rechaza el canal. */
export function resolveReplyService(channel: string): { service: OpenBSPService } | { error: string } {
  const service = SUPPORTED_CHANNELS[channel]
  if (!service) {
    return { error: `El canal "${channel}" no admite respuestas salientes automáticas por API` }
  }
  return { service }
}

export async function dispatchConversationReply(
  ctx: ConversationReplyContext,
  input: ConversationReplyInput,
): Promise<ConversationReplyResult> {
  const { payload, user, tenantId } = ctx
  const conversation = input.conversation
  const trimmed = input.text?.trim()

  if (!trimmed) return { ok: false, error: 'El mensaje no puede estar vacío' }

  // Enrutamiento por canal: solo los canales con transporte real. whatsapp_web
  // NO es whatsapp — enviarlo por una cuenta de WhatsApp alcanzaría al contacto
  // por un canal que nunca autorizó (revisión Devin PR #75).
  const routing = resolveReplyService(conversation.channel)
  if ('error' in routing) return { ok: false, error: routing.error, unsupportedChannel: true }
  const service: OpenBSPService = routing.service

  // Ventana de 24h de Meta: fuera de ella solo se permiten plantillas aprobadas
  if (
    !conversation.lastInboundAt ||
    Date.now() - new Date(conversation.lastInboundAt).getTime() > WINDOW_MS
  ) {
    return {
      ok: false,
      error: 'Fuera de la ventana de 24h: la sesión del cliente ha expirado',
      needsTemplate: true,
    }
  }

  const tenants = await payload.find({
    collection: 'tenants',
    where: { id: { equals: tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const tenant = tenants.docs[0] as Tenant | undefined

  const stableKey =
    input.idempotencyKey ||
    `msg_${conversation.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  // Idempotencia: ¿ya existe un registro con esta clave? Si ya se despachó,
  // devolver su id SIN reenviar. Si estaba marcado fallido, reintentar.
  const recentMessages = await payload.find({
    collection: 'messages',
    where: {
      and: [{ tenant: { equals: tenantId } }, { conversation: { equals: conversation.id } }],
    },
    limit: 30,
    sort: '-createdAt',
    overrideAccess: true,
  })

  const existing = recentMessages.docs.find((m) => {
    const s = m.statusJson as Record<string, unknown> | undefined
    return s?.idempotencyKey === stableKey || m.openbspId === `pending:${stableKey}`
  }) as Message | undefined

  let pendingRecord = existing
  const statusJson = pendingRecord?.statusJson as Record<string, unknown> | undefined
  if (
    pendingRecord &&
    (statusJson?.dispatchStatus === 'dispatched' ||
      (pendingRecord.openbspId && !pendingRecord.openbspId.startsWith('pending:')))
  ) {
    try {
      await payload.update({
        collection: 'conversations',
        id: conversation.id,
        overrideAccess: true,
        data: { lastMessageAt: new Date().toISOString() },
      })
    } catch {
      // Silencioso: no bloquear si la actualización de timestamp ya está al día
    }
    return { ok: true, messageId: pendingRecord.id }
  }

  if (pendingRecord && statusJson?.dispatchStatus === 'failed') {
    await payload
      .update({
        collection: 'messages',
        id: pendingRecord.id,
        overrideAccess: true,
        data: { statusJson: { idempotencyKey: stableKey, dispatchStatus: 'pending' } },
      })
      .catch(() => {})
  } else if (!pendingRecord) {
    pendingRecord = (await payload.create({
      collection: 'messages',
      overrideAccess: true,
      data: {
        conversation: conversation.id,
        direction: 'outbound',
        openbspId: `pending:${stableKey}`,
        type: 'text',
        text: trimmed,
        content: {},
        statusJson: { idempotencyKey: stableKey, dispatchStatus: 'pending' },
        sentAt: new Date().toISOString(),
        performedBy: user.id,
        tenant: tenantId,
      },
    })) as Message
  }

  // Despacho externo consciente del canal y de la cuenta por la que llegó
  let reconcilePending = false
  let row: OpenBSPMessageRow
  try {
    row = await sendText({
      to: conversation.contactAddress,
      text: trimmed,
      tenant: tenant ?? undefined,
      service,
      // El remitente debe coincidir con la cuenta por la que llegó el entrante
      // (organization_address del webhook). Con varios números de la misma
      // organización, cada conversación responde desde su propio número.
      senderAddress: conversation.organizationAddress || undefined,
    })
  } catch (dispatchErr) {
    // Registrar fallo para permitir reintento seguro sin duplicar
    await payload
      .update({
        collection: 'messages',
        id: pendingRecord.id,
        overrideAccess: true,
        data: {
          statusJson: {
            idempotencyKey: stableKey,
            dispatchStatus: 'failed',
            error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
          },
        },
      })
      .catch(() => {})
    const message = dispatchErr instanceof Error ? dispatchErr.message : 'Error enviando mensaje'
    const notConfigured = message.startsWith('OpenBSP no configurado')
    return {
      ok: false,
      error: notConfigured ? 'Mensajería no configurada (falta OpenBSP)' : message,
      notConfigured,
    }
  }

  // Entrega exitosa: persistir identificadores (con reintentos + conciliación
  // mínima para no dejar la fila indistinguible de un no-despachado)
  try {
    await payload.update({
      collection: 'messages',
      id: pendingRecord.id,
      overrideAccess: true,
      data: {
        openbspId: row.id,
        externalId: row.external_id ?? undefined,
        statusJson: {
          ...(typeof row.status === 'object' && row.status ? row.status : {}),
          idempotencyKey: stableKey,
          dispatchStatus: 'dispatched',
        },
      },
    })
  } catch (postDispatchUpdateErr) {
    let reconciled = false
    let lastRetryErr: unknown = postDispatchUpdateErr
    for (let attempt = 0; attempt < 3 && !reconciled; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
      try {
        await payload.update({
          collection: 'messages',
          id: pendingRecord.id,
          overrideAccess: true,
          data: {
            openbspId: row.id,
            statusJson: {
              ...(typeof row.status === 'object' && row.status ? row.status : {}),
              idempotencyKey: stableKey,
              dispatchStatus: 'dispatched',
            },
          },
        })
        reconciled = true
      } catch (retryErr) {
        lastRetryErr = retryErr
      }
    }
    if (!reconciled) {
      try {
        await payload.update({
          collection: 'messages',
          id: pendingRecord.id,
          overrideAccess: true,
          data: { openbspId: row.id },
        })
        reconciled = true
      } catch (minimalRetryErr) {
        lastRetryErr = minimalRetryErr
      }
    }
    if (!reconciled) {
      payload.logger.error({
        msg: 'reply: failed to persist message state after successful OpenBSP dispatch (reconciliation pending)',
        err: lastRetryErr,
        messageId: pendingRecord.id,
        openbspId: row.id,
        idempotencyKey: stableKey,
      })
      reconcilePending = true
    }
  }

  try {
    await payload.update({
      collection: 'conversations',
      id: conversation.id,
      overrideAccess: true,
      data: { lastMessageAt: new Date().toISOString() },
    })
  } catch (postDispatchConvErr) {
    payload.logger.error({
      msg: 'reply: failed to update conversation lastMessageAt after successful dispatch',
      err: postDispatchConvErr,
      conversationId: conversation.id,
    })
  }

  for (const path of input.revalidatePaths ?? []) revalidatePath(path)

  return {
    ok: true,
    messageId: pendingRecord.id,
    ...(reconcilePending ? { reconcilePending: true } : {}),
  }
}

