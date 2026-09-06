'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'

import type { Conversation, Message, Tenant } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { getTenantAiModel } from '@/lib/ai-provider'
import { dispatchConversationReply } from '@/lib/message-dispatch'
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
  idempotencyKey: string,
): Promise<ActionResult<{ messageId: number; reconcilePending?: boolean }>> {
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

    // Despacho unificado vía message-dispatch (canal, ventana 24h e
    // idempotencia) — misma implementación que el drawer del pipeline y el
    // endpoint REST para que ningún reintento duplique el mensaje.
    const result = await dispatchConversationReply(
      { payload: context.payload, user: context.user, tenantId: context.tenantId },
      { conversation, text: trimmed, idempotencyKey, revalidatePaths: ['/workspace/inbox'] },
    )
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        ...('needsTemplate' in result && result.needsTemplate ? { needsTemplate: true } : {}),
      }
    }
    return { ok: true, messageId: result.messageId, ...(result.reconcilePending ? { reconcilePending: true } : {}) }
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
