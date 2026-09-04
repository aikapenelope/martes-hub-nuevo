'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'

import type { Conversation, Message, Tenant } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { getTenantAiModel } from '@/lib/ai-provider'
import { sendText, type OpenBSPService, type OpenBSPMessageRow } from '@/integrations/openbsp/client'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
import { getAssignableUsers } from '@/lib/tasks-data'
import type { TeamMember } from '@/components/workspace/inbox/InboxCrmContextPanel'

const WINDOW_MS = 24 * 60 * 60 * 1000

type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; needsTemplate?: boolean }

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

/**
 * Carga los usuarios asignables para el tenant activo respetando el contrato
 * canónico (usuarios activos pertenecientes al tenant o administradores globales).
 */
export async function getInboxAssigneesAction(): Promise<TeamMember[]> {
  const context = await getWorkspaceContext()
  const users = await getAssignableUsers({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
  })
  return users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    roles: u.roles,
  }))
}

/**
 * Envía una respuesta por WhatsApp o Instagram en la conversación activa.
 * - Enruta según conversation.channel (rechaza canales no soportados como whatsapp_web).
 * - Persiste un registro pendiente con clave de idempotencia antes del despacho externo.
 * - Si el envío a OpenBSP tiene éxito pero la actualización posterior de Payload falla,
 *   reconcilia sin reportar error de envío al cliente y evita entregas duplicadas en reintentos.
 */
export async function replyConversationAction(
  conversationId: number,
  text: string,
  idempotencyKey?: string,
): Promise<ActionResult<{ messageId: number }>> {
  try {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('El mensaje no puede estar vacío')

    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para responder conversaciones')

    if (!(await checkUserActionRateLimit(context.user.id, 'whatsapp-reply'))) {
      return { ok: false, error: 'Demasiados mensajes seguidos — espera un minuto e intenta de nuevo' }
    }

    const conversation = (await context.payload.findByID({
      collection: 'conversations',
      id: conversationId,
      depth: 1,
      overrideAccess: false,
      user: context.user,
    })) as Conversation | null

    if (!conversation) throw new Error('Conversación no encontrada')

    const convTenantId = relId(conversation.tenant)
    if (convTenantId !== context.tenantId) {
      throw new Error('La conversación no pertenece al tenant activo')
    }

    // Regla de enrutamiento por canal y rechazo explícito de no soportados
    let service: OpenBSPService
    if (conversation.channel === 'whatsapp') {
      service = 'whatsapp'
    } else if (conversation.channel === 'instagram_dm') {
      service = 'instagram_dm'
    } else {
      return {
        ok: false,
        error: `El canal "${conversation.channel}" no admite respuestas salientes automáticas por API`,
      }
    }

    // Regla de ventana de 24 horas de Meta
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

    const tenants = await context.payload.find({
      collection: 'tenants',
      where: { id: { equals: context.tenantId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const tenant = tenants.docs[0] as Tenant | undefined

    const stableKey =
      idempotencyKey ||
      `msg_${conversationId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Verificar si ya existe un mensaje reciente con esta clave de idempotencia
    const recentMessages = await context.payload.find({
      collection: 'messages',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { conversation: { equals: conversation.id } },
        ],
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

    // Si ya existía y fue despachado previamente a OpenBSP, reconciliar y retornar sin reenviar
    const statusJson = pendingRecord?.statusJson as Record<string, unknown> | undefined
    if (
      pendingRecord &&
      (statusJson?.dispatchStatus === 'dispatched' ||
        (pendingRecord.openbspId && !pendingRecord.openbspId.startsWith('pending:')))
    ) {
      try {
        await context.payload.update({
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

    // Si ya existía y estaba marcado como fallido, actualizarlo a pending para el nuevo intento
    if (pendingRecord && statusJson?.dispatchStatus === 'failed') {
      await context.payload
        .update({
          collection: 'messages',
          id: pendingRecord.id,
          overrideAccess: true,
          data: {
            statusJson: {
              idempotencyKey: stableKey,
              dispatchStatus: 'pending',
            },
          },
        })
        .catch(() => {})
    } else if (!pendingRecord) {
      pendingRecord = (await context.payload.create({
        collection: 'messages',
        overrideAccess: true,
        data: {
          conversation: conversation.id,
          direction: 'outbound',
          openbspId: `pending:${stableKey}`,
          type: 'text',
          text: trimmed,
          content: {},
          statusJson: {
            idempotencyKey: stableKey,
            dispatchStatus: 'pending',
          },
          sentAt: new Date().toISOString(),
          performedBy: context.user.id,
          tenant: context.tenantId,
        },
      })) as Message
    }

    // Despacho externo a OpenBSP consciente del canal
    let row: OpenBSPMessageRow
    try {
      row = await sendText({
        to: conversation.contactAddress,
        text: trimmed,
        tenant: tenant ?? undefined,
        service,
      })
    } catch (dispatchErr) {
      // Registrar fallo para permitir reintento seguro sin duplicar
      await context.payload
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
      throw dispatchErr
    }

    // Despacho externo exitoso: persistir identificadores devueltos
    try {
      await context.payload.update({
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
      // La entrega externa ya se produjo: registrar pero NO reportar fallo al cliente
      context.payload.logger.error({
        msg: 'inbox: failed to update message row after successful OpenBSP dispatch',
        err: postDispatchUpdateErr,
        messageId: pendingRecord.id,
        openbspId: row.id,
      })
    }

    try {
      await context.payload.update({
        collection: 'conversations',
        id: conversation.id,
        overrideAccess: true,
        data: { lastMessageAt: new Date().toISOString() },
      })
    } catch (postDispatchConvErr) {
      context.payload.logger.error({
        msg: 'inbox: failed to update conversation lastMessageAt after successful dispatch',
        err: postDispatchConvErr,
        conversationId: conversation.id,
      })
    }

    revalidatePath('/workspace/inbox')
    return { ok: true, messageId: pendingRecord.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error enviando mensaje'
    const notConfigured = message.startsWith('OpenBSP no configurado')
    return { ok: false, error: notConfigured ? 'Mensajería no configurada (falta OpenBSP)' : message }
  }
}

/**
 * Actualiza metadatos de la conversación (estado, prioridad, agente asignado, snooze o etiquetas).
 */
export async function updateConversationMetaAction(
  conversationId: number,
  patch: {
    status?: 'open' | 'pending' | 'resolved'
    priority?: 'baja' | 'media' | 'alta'
    assignee?: number | null
    snoozeUntil?: string | null
    labels?: ('seguimiento' | 'facturacion' | 'soporte' | 'renovacion' | 'urgente' | 'oportunidad')[]
  },
): Promise<ActionResult> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para actualizar conversaciones')

    const conversation = await context.payload.findByID({
      collection: 'conversations',
      id: conversationId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })
    if (!conversation) throw new Error('Conversación no encontrada')

    const convTenant = relId(conversation.tenant)
    if (convTenant !== context.tenantId) {
      throw new Error('La conversación no pertenece al tenant activo')
    }

    // Validar asignación de agente dentro del tenant o administrador global
    if (patch.assignee) {
      const assigneeUser = await context.payload.findByID({
        collection: 'users',
        id: patch.assignee,
        depth: 0,
        overrideAccess: false,
        user: context.user,
      })
      if (!assigneeUser || assigneeUser.active === false) {
        throw new Error('El usuario asignado no está disponible')
      }
      const isGlobalAdmin = assigneeUser.roles?.includes('admin')
      const userTenants = (assigneeUser.tenants ?? []).map((t) =>
        typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant,
      )
      if (!isGlobalAdmin && !userTenants.includes(context.tenantId)) {
        throw new Error('El agente no pertenece al tenant activo')
      }
    }

    await context.payload.update({
      collection: 'conversations',
      id: conversationId,
      overrideAccess: false,
      user: context.user,
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}),
        ...(patch.snoozeUntil !== undefined ? { snoozeUntil: patch.snoozeUntil } : {}),
        ...(patch.labels !== undefined ? { labels: patch.labels } : {}),
      },
    })

    revalidatePath('/workspace/inbox')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error actualizando conversación' }
  }
}

/**
 * Agrega una nota interna privada del equipo sobre una conversación.
 */
export async function addConversationNoteAction(
  conversationId: number,
  body: string,
): Promise<ActionResult<{ noteId: number }>> {
  try {
    const trimmed = body.trim().slice(0, 4000)
    if (!trimmed) throw new Error('La nota interna no puede estar vacía')

    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para agregar notas internas')

    const conversation = await context.payload.findByID({
      collection: 'conversations',
      id: conversationId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })
    if (!conversation) throw new Error('Conversación no encontrada')

    const convTenant = relId(conversation.tenant)
    if (convTenant !== context.tenantId) {
      throw new Error('La conversación no pertenece al tenant activo')
    }

    const note = await context.payload.create({
      collection: 'conversation-notes',
      overrideAccess: false,
      user: context.user,
      data: {
        conversation: conversationId,
        body: trimmed,
        author: context.user.id,
        tenant: context.tenantId,
      },
    })

    revalidatePath('/workspace/inbox')
    return { ok: true, noteId: note.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al guardar la nota' }
  }
}

const AI_SUMMARY_SCHEMA = z.object({
  summary: z.string().describe('Resumen ejecutivo de la conversación en español, 2-4 frases'),
  sentiment: z.enum(['positivo', 'neutral', 'negativo', 'en_riesgo']),
  objections: z.string().optional().describe('Objeciones detectadas: precio, tiempos, dudas técnicas, etc.'),
  nextSteps: z.string().optional().describe('Próximos pasos sugeridos, en 1-2 frases'),
})

/**
 * Copiloto IA del Inbox: sintetiza los últimos mensajes de la conversación,
 * extrae sentimiento, objeciones y próximos pasos.
 */
export async function summarizeConversationWithAiAction(
  conversationId: number,
): Promise<ActionResult<{ summaryId: number; summaryText: string; sentiment: string }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para generar resúmenes con IA')

    if (!(await checkUserActionRateLimit(context.user.id, 'ai-summary'))) {
      return { ok: false, error: 'Demasiados resúmenes seguidos — espera un momento e intenta de nuevo' }
    }

    const conversation = (await context.payload.findByID({
      collection: 'conversations',
      id: conversationId,
      depth: 1,
      overrideAccess: false,
      user: context.user,
    })) as Conversation | null

    if (!conversation) throw new Error('Conversación no encontrada')

    const convTenant = relId(conversation.tenant)
    if (convTenant !== context.tenantId) {
      throw new Error('La conversación no pertenece al tenant activo')
    }

    const resolvedAi = await getTenantAiModel(context.payload, context.tenantId)
    if (!resolvedAi) {
      throw new Error('Sin proveedor de IA: configura Groq u OpenRouter en Ajustes del Workspace')
    }

    const messagesResult = await context.payload.find({
      collection: 'messages',
      limit: 20,
      depth: 0,
      sort: '-sentAt',
      overrideAccess: false,
      user: context.user,
      where: { and: [{ tenant: { equals: context.tenantId } }, { conversation: { equals: conversationId } }] },
    })

    const messages = (messagesResult.docs as Message[]).slice().reverse()
    if (messages.length === 0) throw new Error('Todavía no hay mensajes en esta conversación para resumir')

    const contactTitle =
      typeof conversation.client === 'object' && conversation.client?.name
        ? conversation.client.name
        : typeof conversation.lead === 'object' && conversation.lead?.fullName
          ? conversation.lead.fullName
          : conversation.contactAddress

    const transcript = messages
      .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Asesor'}: ${m.text || `[${m.type}]`}`)
      .join('\n')

    const { object } = await generateObject({
      model: resolvedAi.model,
      schema: AI_SUMMARY_SCHEMA,
      system:
        'Eres el copiloto comercial de un CRM omnicanal (WhatsApp/Instagram). Analiza conversaciones en español de forma concisa, detectando sentimiento, objeciones y próximos pasos clave.',
      prompt: `Analiza esta interacción con "${contactTitle}":\n\n${transcript}`,
    })

    const leadId = relId(conversation.lead)
    const clientId = relId(conversation.client)

    const created = await context.payload.create({
      collection: 'conversation-summaries',
      overrideAccess: false,
      user: context.user,
      data: {
        title: `Resumen Inbox — ${contactTitle}`,
        conversation: conversationId,
        lead: leadId ?? undefined,
        client: clientId ?? undefined,
        summary: object.summary,
        sentiment: object.sentiment,
        objections: object.objections,
        nextSteps: object.nextSteps,
        generatedBy: 'hermes_ai',
        tenant: context.tenantId,
      },
    })

    // Si tiene lead asociado, anexar también a las notas del lead como seguimiento no crítico
    if (leadId) {
      try {
        const leadDoc = await context.payload.findByID({
          collection: 'leads',
          id: leadId,
          depth: 0,
          overrideAccess: false,
          user: context.user,
        })
        if (leadDoc) {
          await context.payload.update({
            collection: 'leads',
            id: leadId,
            overrideAccess: false,
            user: context.user,
            data: {
              notes: [leadDoc.notes, `[IA Inbox ${new Date().toLocaleDateString('es-ES')}] ${object.summary}`]
                .filter(Boolean)
                .join('\n\n'),
            },
          })
        }
      } catch (leadNoteErr) {
        context.payload.logger.error({
          msg: 'inbox: fallo al anexar resumen a notas del lead (no crítico)',
          err: leadNoteErr,
          leadId,
          summaryId: created.id,
        })
      }
    }

    revalidatePath('/workspace/inbox')
    return { ok: true, summaryId: created.id, summaryText: object.summary, sentiment: object.sentiment }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error generando resumen de IA' }
  }
}
