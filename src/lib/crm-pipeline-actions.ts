'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getTenantAiModel } from '@/lib/ai-provider'

import type { Lead, Message, Tenant } from '@/payload-types'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/crm-filters'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { getAssignableUsers } from '@/lib/tasks-data'
import { buildLeadUpdateData, type LeadFieldsInput } from '@/lib/lead-update-data'
import { sendText } from '@/integrations/openbsp/client'
import { renderEmailHtml } from '@/email/layout'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'

const WINDOW_MS = 24 * 60 * 60 * 1000

const STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  descartado: 'Descartado',
}

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; needsTemplate?: boolean }

/** Cliente vinculado al lead si ya convirtió (depth 0 ⇒ id numérico o doc poblado). */
function convertedClientIdOf(lead: Lead | undefined): number | undefined {
  if (!lead?.convertedClient) return undefined
  return typeof lead.convertedClient === 'object' ? lead.convertedClient.id : lead.convertedClient
}

import { getScopedLead } from '@/lib/crm-scoped-entities'

const scopedLead = getScopedLead

/**
 * Cambia la etapa de un lead desde el tablero Kanban (drag-and-drop) y
 * registra la transición en el timeline. Mismo patrón de acceso que
 * `crm-actions.ts`: `overrideAccess: false` + `user` del tenant activo.
 */
export async function changeLeadStageAction(leadId: number, newStatus: LeadStatus): Promise<ActionResult> {
  try {
    if (!LEAD_STATUSES.includes(newStatus)) throw new Error('Estado de lead inválido')
    const { lead, context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para mover leads en el pipeline')

    if (lead.status !== newStatus) {
      await context.payload.update({
        collection: 'leads',
        id: leadId,
        overrideAccess: false,
        user: context.user,
        data: { status: newStatus },
      })

      await context.payload.create({
        collection: 'activities',
        overrideAccess: false,
        user: context.user,
        data: {
          tenant: context.tenantId,
          type: 'nota',
          occurredAt: new Date().toISOString(),
          summary: `Etapa cambiada de ${STATUS_LABEL[lead.status]} a ${STATUS_LABEL[newStatus]}`,
          lead: leadId,
        },
      })
    }

    revalidatePath('/workspace/crm')
    revalidatePath(`/workspace/crm/leads/${leadId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

/**
 * Respuesta rápida por WhatsApp/Instagram desde la pestaña de chat del
 * drawer. Mismo flujo que `endpoints/replyConversation.ts` (ventana 24h,
 * envío por OpenBSP, registro en `messages`), pero resuelto por `leadId`
 * en vez de `conversationId` y como Server Action en lugar de endpoint
 * HTTP. `messages` deniega `create` por diseño salvo `overrideAccess`
 * (ver `Messages.ts`): igual que el endpoint de respuesta, se autoriza
 * aquí explícitamente tras validar rol, tenant y ventana — no es un
 * bypass sin control.
 */
export async function quickReplyLeadChatAction(
  leadId: number,
  text: string,
): Promise<ActionResult<{ messageId: number }>> {
  try {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('El mensaje no puede estar vacío')
    const { context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para responder conversaciones')
    if (!(await checkUserActionRateLimit(context.user.id, 'whatsapp-reply'))) {
      return { ok: false, error: 'Demasiados mensajes seguidos — espera un minuto e intenta de nuevo' }
    }

    const conversations = await context.payload.find({
      collection: 'conversations',
      limit: 1,
      depth: 0,
      sort: '-lastMessageAt',
      overrideAccess: false,
      user: context.user,
      where: { and: [{ tenant: { equals: context.tenantId } }, { lead: { equals: leadId } }] },
    })
    const conversation = conversations.docs[0]
    if (!conversation) throw new Error('Este lead todavía no tiene una conversación activa')

    if (!conversation.lastInboundAt || Date.now() - new Date(conversation.lastInboundAt).getTime() > WINDOW_MS) {
      return {
        ok: false,
        error: 'Fuera de la ventana de 24h: envía una plantilla aprobada en lugar de texto libre',
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

    const row = await sendText({ to: conversation.contactAddress, text: trimmed, tenant })

    const created = await context.payload.create({
      collection: 'messages',
      overrideAccess: true,
      data: {
        conversation: conversation.id,
        direction: 'outbound',
        openbspId: row.id,
        externalId: row.external_id ?? undefined,
        type: 'text',
        text: trimmed,
        content: {},
        statusJson: row.status ?? {},
        sentAt: new Date().toISOString(),
        performedBy: context.user.id,
        tenant: context.tenantId,
      },
    })

    await context.payload.update({
      collection: 'conversations',
      id: conversation.id,
      overrideAccess: true,
      data: { lastMessageAt: new Date().toISOString() },
    })

    revalidatePath('/workspace/crm')
    revalidatePath('/workspace/inbox')
    return { ok: true, messageId: created.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error enviando mensaje'
    const notConfigured = message.startsWith('OpenBSP no configurado')
    return { ok: false, error: notConfigured ? 'Mensajería no configurada (falta OpenBSP)' : message }
  }
}

/**
 * Envía un correo directo al lead desde la pestaña de email del drawer,
 * vía el adapter oficial de Resend (`payload.sendEmail`, ya configurado en
 * `payload.config.ts`). Registra el resultado en `email-log` y en el
 * timeline. A diferencia de `messages`, `email-log` sí permite `create` a
 * editores directamente (ver `EmailLog.ts`), así que no necesita
 * `overrideAccess`.
 */
export async function sendLeadEmailAction(
  leadId: number,
  input: { subject: string; bodyHtml: string; to?: string },
): Promise<ActionResult<{ emailLogId: number }>> {
  let context: Awaited<ReturnType<typeof getWorkspaceContext>> | undefined
  let to = ''
  let subject = ''
  let scoped: Awaited<ReturnType<typeof scopedLead>> | undefined
  try {
    scoped = await scopedLead(leadId)
    context = scoped.context
    if (!context.canEdit) throw new Error('No tienes permiso para enviar correos')
    if (!(await checkUserActionRateLimit(context.user.id, 'send-email'))) {
      return { ok: false, error: 'Demasiados correos seguidos — espera un minuto e intenta de nuevo' }
    }
    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'Email no configurado (falta RESEND_API_KEY)' }
    }

    to = (input.to || scoped.lead.email || '').trim()
    if (!to) throw new Error('El lead no tiene email registrado')
    subject = input.subject.trim().slice(0, 200)
    if (!subject) throw new Error('El asunto es obligatorio')
    const bodyHtml = input.bodyHtml.trim()
    if (!bodyHtml) throw new Error('El cuerpo del correo es obligatorio')

    const html = renderEmailHtml({ title: subject, bodyHtml })
    const result = (await context.payload.sendEmail({ to, subject, html })) as { id?: string } | null | undefined

    // Vincular el email al lead y, si ya convirtió, a su cliente — para que
    // aparezca en los joins de la ficha (email-log → clients/leads).
    const convertedClientId = convertedClientIdOf(scoped.lead)

    const emailLog = await context.payload.create({
      collection: 'email-log',
      overrideAccess: false,
      user: context.user,
      data: {
        to,
        subject,
        status: 'sent',
        source: 'transactional',
        providerMessageId: result?.id,
        lead: leadId,
        ...(convertedClientId ? { client: convertedClientId } : {}),
        tenant: context.tenantId,
      },
    })

    await context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        type: 'email',
        occurredAt: new Date().toISOString(),
        summary: `Email enviado: "${subject}"`,
        lead: leadId,
      },
    })

    revalidatePath(`/workspace/crm/leads/${leadId}`)
    revalidatePath('/workspace/crm')
    return { ok: true, emailLogId: emailLog.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    if (context && to && subject) {
      await context.payload
        .create({
          collection: 'email-log',
          overrideAccess: false,
          user: context.user,
          data: {
            to,
            subject,
            status: 'failed',
            source: 'transactional',
            error: message.slice(0, 1000),
            lead: leadId,
            ...(convertedClientIdOf(scoped?.lead)
              ? { client: convertedClientIdOf(scoped?.lead) }
              : {}),
            tenant: context.tenantId,
          },
        })
        .catch(() => undefined)
    }
    return { ok: false, error: message }
  }
}

/**
 * Edición de los campos comerciales del lead desde la pestaña "Datos CRM"
 * del drawer. Variante sin redirect de `updateLeadAction` (crm-actions.ts):
 * el drawer vive sobre el tablero Kanban y no navega de página.
 */
export async function updateLeadFieldsAction(
  leadId: number,
  input: LeadFieldsInput,
): Promise<ActionResult> {
  try {
    const { context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para editar este lead')

    const fullName = input.fullName.trim().slice(0, 160)
    if (!fullName) throw new Error('El nombre es obligatorio')

    // Validación de tenancy: el editor podría enviar IDs arbitrarios de otros
    // tenants. El segmento debe pertenecer al tenant activo y el agente debe
    // ser asignable (miembro del tenant o admin global).
    if (input.segment != null) {
      const segment = await context.payload.findByID({
        collection: 'segments',
        id: input.segment,
        depth: 0,
        overrideAccess: false,
        user: context.user,
      })
      const segmentTenant = (segment as { tenant?: number | null } | null | undefined)?.tenant
      if (!segment || (segmentTenant != null && segmentTenant !== context.tenantId)) {
        throw new Error('El rubro seleccionado no pertenece a este tenant')
      }
    }
    if (input.assignedTo != null) {
      const assignables = await getAssignableUsers({
        payload: context.payload,
        user: context.user,
        tenantId: context.tenantId,
      })
      if (!assignables.some((u) => u.id === input.assignedTo)) {
        throw new Error('El agente asignado no es válido para este tenant')
      }
    }

    await context.payload.update({
      collection: 'leads',
      id: leadId,
      overrideAccess: false,
      user: context.user,
      // buildLeadUpdateData: null = limpiar la relación (elección explícita),
      // undefined = omitir el campo (no toca el valor guardado).
      data: buildLeadUpdateData(input),
    })

    revalidatePath('/workspace/crm')
    revalidatePath(`/workspace/crm/leads/${leadId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error actualizando el lead' }
  }
}

const AI_SUMMARY_SCHEMA = z.object({
  summary: z.string().describe('Resumen ejecutivo de la conversación en español, 2-4 frases'),
  sentiment: z.enum(['positivo', 'neutral', 'negativo', 'en_riesgo']),
  objections: z.string().optional().describe('Objeciones detectadas: precio, tiempos, dudas técnicas, etc.'),
  nextSteps: z.string().optional().describe('Próximos pasos sugeridos, en 1-2 frases'),
})

/**
 * Copiloto IA: resume los últimos 20 mensajes de la conversación activa
 * del lead (sentimiento, objeciones, próximos pasos), guarda el resultado
 * en `conversation-summaries` y lo anexa a las notas del lead. Única
 * llamada directa a un LLM que mantiene el sistema (Anthropic/OpenAI vía
 * env var) — es una acción puntual y de un solo propósito, no un chat de
 * uso general. Cualquier análisis más abierto se hace conectando un
 * cliente MCP externo a `/api/mcp` con el modelo que prefieras.
 */
export async function summarizeLeadWithAIAction(leadId: number): Promise<ActionResult<{ summaryId: number }>> {
  try {
    const { lead, context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para generar resúmenes de IA')
    if (!(await checkUserActionRateLimit(context.user.id, 'ai-summary'))) {
      return { ok: false, error: 'Demasiados resúmenes de IA seguidos — espera un minuto e intenta de nuevo' }
    }

    const resolvedAi = await getTenantAiModel(context.payload, context.tenantId)
    if (!resolvedAi) {
      throw new Error('Sin proveedor de IA: configura Groq u OpenRouter en Ajustes del Workspace o define variables de entorno')
    }
    const model = resolvedAi.model

    const conversations = await context.payload.find({
      collection: 'conversations',
      limit: 1,
      depth: 0,
      sort: '-lastMessageAt',
      overrideAccess: false,
      user: context.user,
      where: { and: [{ tenant: { equals: context.tenantId } }, { lead: { equals: leadId } }] },
    })
    const conversation = conversations.docs[0]
    if (!conversation) throw new Error('Este lead todavía no tiene una conversación para resumir')

    const messagesResult = await context.payload.find({
      collection: 'messages',
      limit: 20,
      depth: 0,
      sort: '-sentAt',
      overrideAccess: false,
      user: context.user,
      where: { and: [{ tenant: { equals: context.tenantId } }, { conversation: { equals: conversation.id } }] },
    })
    const messages = (messagesResult.docs as Message[]).slice().reverse()
    if (messages.length === 0) throw new Error('Todavía no hay mensajes en esta conversación para resumir')

    const transcript = messages
      .map((message) => `${message.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${message.text || `[${message.type}]`}`)
      .join('\n')

    const { object } = await generateObject({
      model,
      schema: AI_SUMMARY_SCHEMA,
      system:
        'Analizas conversaciones comerciales de WhatsApp/Instagram para un CRM. Responde siempre en español, de forma concisa y concreta, basándote únicamente en la transcripción dada.',
      prompt: `Analiza esta conversación con el lead "${lead.fullName}" y extrae un resumen ejecutivo, el sentimiento del cliente, las objeciones detectadas y los próximos pasos sugeridos.\n\n${transcript}`,
    })

    const created = await context.payload.create({
      collection: 'conversation-summaries',
      overrideAccess: false,
      user: context.user,
      data: {
        title: `Resumen IA — ${lead.fullName}`,
        conversation: conversation.id,
        lead: leadId,
        summary: object.summary,
        sentiment: object.sentiment,
        objections: object.objections,
        nextSteps: object.nextSteps,
        generatedBy: 'hermes_ai',
        tenant: context.tenantId,
      },
    })

    await context.payload.update({
      collection: 'leads',
      id: leadId,
      overrideAccess: false,
      user: context.user,
      data: {
        notes: [lead.notes, `[IA ${new Date().toLocaleDateString('es-ES')}] ${object.summary}`]
          .filter(Boolean)
          .join('\n\n'),
      },
    })

    await context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        type: 'nota',
        occurredAt: new Date().toISOString(),
        summary: 'Resumen de IA generado',
        lead: leadId,
      },
    })

    revalidatePath(`/workspace/crm/leads/${leadId}`)
    revalidatePath('/workspace/crm')
    return { ok: true, summaryId: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error generando el resumen de IA' }
  }
}

/**
 * Convierte un lead en cliente registrado in-situ (sin redirección forzada de página).
 * Permite actualización reactiva directa desde el Kanban y el Drawer 360°.
 */
export async function convertLeadInSituAction(leadId: number): Promise<ActionResult<{ clientId: number }>> {
  try {
    const { lead, context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para convertir prospectos')

    const existingClientId = convertedClientIdOf(lead)
    if (existingClientId) {
      return { ok: true, clientId: existingClientId }
    }

    const client = await context.payload.create({
      collection: 'clients',
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId, skipLeadConversion: true },
      data: {
        tenant: context.tenantId,
        name: lead.fullName,
        stage: 'nuevo',
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        city: lead.city ?? undefined,
        address: lead.address ?? undefined,
        googleMapsUrl: lead.googleMapsUrl ?? undefined,
        socialHandle: lead.socialHandle ?? undefined,
        segment: typeof lead.segment === 'number' ? lead.segment : lead.segment?.id,
        company: typeof lead.company === 'number' ? lead.company : lead.company?.id,
        companyName: lead.companyName ?? undefined,
        assignedAgent: typeof lead.assignedTo === 'number' ? lead.assignedTo : lead.assignedTo?.id,
        commercialNotes: lead.commercialNotes ?? undefined,
        notes: lead.notes ?? undefined,
      },
    })

    await context.payload.update({
      collection: 'leads',
      id: leadId,
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: {
        status: 'calificado',
        convertedClient: client.id,
      },
    })

    await Promise.all([
      context.payload.create({
        collection: 'activities',
        overrideAccess: false,
        user: context.user,
        context: { tenantId: context.tenantId },
        data: {
          tenant: context.tenantId,
          type: 'nota',
          occurredAt: new Date().toISOString(),
          summary: `Convertido desde prospecto #${lead.id} (${lead.fullName})`,
          client: client.id,
          performedBy: context.user.id,
        },
      }),
      context.payload.create({
        collection: 'activities',
        overrideAccess: false,
        user: context.user,
        context: { tenantId: context.tenantId },
        data: {
          tenant: context.tenantId,
          type: 'nota',
          occurredAt: new Date().toISOString(),
          summary: `Convertido a Cliente #${client.id}`,
          lead: lead.id,
          performedBy: context.user.id,
        },
      }),
    ])

    revalidatePath('/workspace/crm')
    revalidatePath(`/workspace/crm/leads/${leadId}`)
    revalidatePath(`/workspace/crm/clientes/${client.id}`)
    return { ok: true, clientId: client.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al convertir el prospecto'
    return { ok: false, error: message }
  }
}

export type LeadActivityType = 'llamada' | 'reunion' | 'email' | 'nota' | 'whatsapp' | 'otro' | 'correo'

/**
 * Registra una actividad o nota rápida en el timeline del lead in-situ.
 */
export async function addLeadActivityInSituAction(params: {
  leadId: number
  summary: string
  type?: LeadActivityType
}): Promise<ActionResult<{ activityId: number }>> {
  try {
    const { lead, context } = await scopedLead(params.leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para registrar actividades')

    const summary = params.summary.trim().slice(0, 500)
    if (!summary) throw new Error('El resumen de la actividad no puede estar vacío')

    let validActivityType: 'llamada' | 'reunion' | 'email' | 'nota' | 'whatsapp' | 'otro' = 'nota'
    if (params.type === 'correo' || params.type === 'email') {
      validActivityType = 'email'
    } else if (params.type === 'llamada' || params.type === 'reunion' || params.type === 'whatsapp' || params.type === 'otro') {
      validActivityType = params.type
    }

    const activity = await context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: {
        tenant: context.tenantId,
        type: validActivityType,
        summary,
        occurredAt: new Date().toISOString(),
        lead: lead.id,
        performedBy: context.user.id,
      },
    })

    revalidatePath(`/workspace/crm/leads/${params.leadId}`)
    return { ok: true, activityId: activity.id }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al registrar la actividad' }
  }
}

