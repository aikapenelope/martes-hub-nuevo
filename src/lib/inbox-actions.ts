'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { Payload, Where } from 'payload'
import type { Conversation, Message, User } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { getTenantAiModel } from '@/lib/ai-provider'
import { dispatchConversationReply } from '@/lib/message-dispatch'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
import { getAssignableUsers } from '@/lib/tasks-data'
import type { TeamMember } from '@/components/workspace/inbox/InboxCrmContextPanel'

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

export interface ContactItem {
  id: number
  kind: 'client' | 'lead'
  name: string
  company?: string | null
  phone?: string | null
  email?: string | null
}

export interface ClientBillingSummary {
  pendingPaymentsCount: number
  pendingTotalUsd: number
  invoicesCount: number
}

/**
 * Valida que los IDs de cliente/lead indicados pertenezcan estrictamente al tenant activo.
 * Previene que editores asocien registros ajenos filtrando datos privados (revisión Devin PR #80).
 */
async function assertCrmRelationInTenant(
  payload: Payload,
  user: User,
  tenantId: number,
  params: { clientId?: number | null; leadId?: number | null },
): Promise<void> {
  if (params.clientId) {
    if (!Number.isInteger(params.clientId) || params.clientId <= 0) {
      throw new Error('Identificador de cliente inválido')
    }
    const clientDoc = await payload.findByID({
      collection: 'clients',
      id: params.clientId,
      depth: 0,
      overrideAccess: false,
      user,
    })
    if (!clientDoc || relId(clientDoc.tenant) !== tenantId) {
      throw new Error('El cliente indicado no pertenece a este workspace')
    }
  }
  if (params.leadId) {
    if (!Number.isInteger(params.leadId) || params.leadId <= 0) {
      throw new Error('Identificador de prospecto inválido')
    }
    const leadDoc = await payload.findByID({
      collection: 'leads',
      id: params.leadId,
      depth: 0,
      overrideAccess: false,
      user,
    })
    if (!leadDoc || relId(leadDoc.tenant) !== tenantId) {
      throw new Error('El prospecto indicado no pertenece a este workspace')
    }
  }
}

/**
 * Búsqueda paginada en servidor de clientes y prospectos del CRM acotada al tenant activo.
 * Implementa ordenamiento determinista y metadatos de paginación para soportar carga infinita sin truncar (revisión Devin PR #80).
 */
export async function searchInboxCrmContactsAction(params: {
  q: string
  kind?: 'all' | 'client' | 'lead'
  page?: number
  limit?: number
}): Promise<ActionResult<{ results: ContactItem[]; hasMore: boolean; total: number }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para buscar contactos')

    const q = params.q.trim()
    const kind = params.kind || 'all'
    const page = Math.max(1, params.page || 1)
    const limit = Math.min(50, Math.max(5, params.limit || 20))

    const clientConditions: Where[] = [{ tenant: { equals: context.tenantId } }]
    const leadConditions: Where[] = [{ tenant: { equals: context.tenantId } }]

    if (q) {
      clientConditions.push({
        or: [
          { name: { like: q } },
          { companyName: { like: q } },
          { phone: { like: q } },
          { email: { like: q } },
        ],
      })
      leadConditions.push({
        or: [
          { fullName: { like: q } },
          { companyName: { like: q } },
          { phone: { like: q } },
          { email: { like: q } },
        ],
      })
    }

    const [clientsRes, leadsRes] = await Promise.all([
      kind !== 'lead'
        ? context.payload.find({
            collection: 'clients',
            where: { and: clientConditions },
            limit,
            page,
            sort: 'name',
            depth: 0,
            overrideAccess: false,
            user: context.user,
            select: {
              name: true,
              companyName: true,
              phone: true,
              email: true,
            },
          })
        : Promise.resolve({ docs: [], hasNextPage: false, totalDocs: 0 }),
      kind !== 'client'
        ? context.payload.find({
            collection: 'leads',
            where: { and: leadConditions },
            limit,
            page,
            sort: 'fullName',
            depth: 0,
            overrideAccess: false,
            user: context.user,
            select: {
              fullName: true,
              companyName: true,
              phone: true,
              email: true,
            },
          })
        : Promise.resolve({ docs: [], hasNextPage: false, totalDocs: 0 }),
    ])

    const results: ContactItem[] = [
      ...clientsRes.docs.map((c) => ({
        id: c.id,
        kind: 'client' as const,
        name: c.name,
        company: c.companyName ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
      })),
      ...leadsRes.docs.map((l) => ({
        id: l.id,
        kind: 'lead' as const,
        name: l.fullName,
        company: l.companyName ?? null,
        phone: l.phone ?? null,
        email: l.email ?? null,
      })),
    ]

    const hasMore = Boolean(clientsRes.hasNextPage || leadsRes.hasNextPage)
    const total = (clientsRes.totalDocs || 0) + (leadsRes.totalDocs || 0)

    return { ok: true, results, hasMore, total }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al buscar contactos' }
  }
}

/**
 * Crea o localiza una conversación en el tenant activo.
 * Respeta el canal exacto para no colapsar hilos de diferentes canales (revisión Devin PR #80)
 * y valida pertenencia multi-tenant de clientes y leads asociados.
 */
export async function createConversationAction(params: {
  contactAddress: string
  channel?: 'whatsapp' | 'instagram_dm' | 'whatsapp_web'
  clientId?: number | null
  leadId?: number | null
  priority?: 'baja' | 'media' | 'alta'
  initialMessage?: string
}): Promise<ActionResult<{ conversationId: number; isNew: boolean }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para crear conversaciones')

    const cleanAddress = params.contactAddress.trim().replace(/^\+/, '')
    if (!cleanAddress) throw new Error('El número o identificador del contacto es obligatorio')

    const channel = params.channel || 'whatsapp'

    // Validar aislamiento multi-tenant de las relaciones CRM provistas
    await assertCrmRelationInTenant(context.payload, context.user, context.tenantId, {
      clientId: params.clientId,
      leadId: params.leadId,
    })

    // Buscar si ya existe una conversación con esta dirección Y este canal en el tenant
    const existing = await context.payload.find({
      collection: 'conversations',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { contactAddress: { equals: cleanAddress } },
          { channel: { equals: channel } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    let conversationId: number
    let isNew = false

    if (existing.docs.length > 0) {
      conversationId = existing.docs[0].id
      const patchData: Record<string, unknown> = {}
      if (params.clientId && !existing.docs[0].client) patchData.client = params.clientId
      if (params.leadId && !existing.docs[0].lead) patchData.lead = params.leadId
      if (Object.keys(patchData).length > 0) {
        await context.payload.update({
          collection: 'conversations',
          id: conversationId,
          data: patchData,
          overrideAccess: false,
          user: context.user,
        })
      }
    } else {
      isNew = true
      const created = await context.payload.create({
        collection: 'conversations',
        overrideAccess: false,
        user: context.user,
        data: {
          tenant: context.tenantId,
          contactAddress: cleanAddress,
          channel,
          status: 'open',
          priority: params.priority || 'media',
          client: params.clientId ?? undefined,
          lead: params.leadId ?? undefined,
          assignee: context.user.id,
          lastMessageAt: new Date().toISOString(),
        },
      })
      conversationId = created.id
    }

    if (params.initialMessage?.trim()) {
      const idempotencyKey = `init_${Date.now()}_${Math.random().toString(36).slice(2)}`
      await replyConversationAction(conversationId, params.initialMessage.trim(), idempotencyKey)
    }

    revalidatePath('/workspace/inbox')
    return { ok: true, conversationId, isNew }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al crear conversación' }
  }
}

/**
 * Vincula una conversación activa a un Cliente o Prospecto del CRM.
 * Valida pertenencia multi-tenant estricta para evitar accesos cruzados entre tenants.
 */
export async function linkConversationToCrmAction(params: {
  conversationId: number
  clientId?: number | null
  leadId?: number | null
}): Promise<ActionResult> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new Error('No tienes permiso para vincular contactos')

    const conv = await context.payload.findByID({
      collection: 'conversations',
      id: params.conversationId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })
    if (!conv) throw new Error('Conversación no encontrada')

    const convTenant = relId(conv.tenant)
    if (convTenant !== context.tenantId) throw new Error('La conversación no pertenece al tenant activo')

    // Validar que el cliente o lead pertenezca estrictamente al tenant activo
    await assertCrmRelationInTenant(context.payload, context.user, context.tenantId, {
      clientId: params.clientId,
      leadId: params.leadId,
    })

    await context.payload.update({
      collection: 'conversations',
      id: params.conversationId,
      overrideAccess: false,
      user: context.user,
      data: {
        ...(params.clientId !== undefined ? { client: params.clientId } : {}),
        ...(params.leadId !== undefined ? { lead: params.leadId } : {}),
      },
    })

    revalidatePath('/workspace/inbox')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al vincular con el CRM' }
  }
}

/**
 * Carga el balance financiero y cobros pendientes de un cliente para la ficha CRM 360°.
 * Valida pertenencia multi-tenant y calcula la suma total exacta paginando todos los registros pendientes (revisión Devin PR #80).
 */
export async function getClientBillingSummaryAction(clientId: number): Promise<
  | { ok: true; summary: ClientBillingSummary }
  | { ok: false; error: string }
> {
  try {
    const context = await getWorkspaceContext()
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return { ok: false, error: 'Identificador de cliente inválido' }
    }

    // Verificar explícitamente que el cliente pertenece al tenant activo
    const clientDoc = await context.payload.findByID({
      collection: 'clients',
      id: clientId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })
    if (!clientDoc || relId(clientDoc.tenant) !== context.tenantId) {
      return { ok: false, error: 'El cliente no pertenece al workspace activo o no existe' }
    }

    let page = 1
    let hasNextPage = true
    let totalPendingCount = 0
    let pendingTotal = 0

    while (hasNextPage) {
      const paymentsRes = await context.payload.find({
        collection: 'payments',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { client: { equals: clientId } },
            { status: { in: ['pendiente', 'vencido'] } },
          ],
        },
        limit: 100,
        page,
        depth: 0,
        overrideAccess: false,
        user: context.user,
        select: {
          amount: true,
        },
      })

      totalPendingCount = paymentsRes.totalDocs
      for (const doc of paymentsRes.docs) {
        pendingTotal += doc.amount || 0
      }

      hasNextPage = Boolean(paymentsRes.hasNextPage)
      page += 1
    }

    const invoicesRes = await context.payload.find({
      collection: 'invoices',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { client: { equals: clientId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    return {
      ok: true,
      summary: {
        pendingPaymentsCount: totalPendingCount,
        pendingTotalUsd: pendingTotal,
        invoicesCount: invoicesRes.totalDocs,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error al consultar estado de facturación',
    }
  }
}

