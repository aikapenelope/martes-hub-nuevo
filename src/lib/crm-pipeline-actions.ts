'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

import type { Lead, Message, Tenant } from '@/payload-types'
import { LEAD_STATUSES, type LeadStatus } from '@/lib/crm-filters'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { sendText } from '@/integrations/openbsp/client'
import { renderEmailHtml } from '@/email/layout'

const WINDOW_MS = 24 * 60 * 60 * 1000

const STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  descartado: 'Descartado',
}

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; needsTemplate?: boolean }

async function scopedLead(id: number): Promise<{ lead: Lead; context: Awaited<ReturnType<typeof getWorkspaceContext>> }> {
  const context = await getWorkspaceContext()
  const result = await context.payload.find({
    collection: 'leads',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const lead = result.docs[0] as Lead | undefined
  if (!lead) throw new Error('Lead no encontrado en el tenant activo')
  return { lead, context }
}

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
  try {
    const scoped = await scopedLead(leadId)
    context = scoped.context
    if (!context.canEdit) throw new Error('No tienes permiso para enviar correos')
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
  input: {
    fullName: string
    phone?: string
    email?: string
    segment?: number | null
    estimatedValue?: number | null
    assignedTo?: number | null
    notes?: string
  },
): Promise<ActionResult> {
  try {
    const { context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para editar este lead')

    const fullName = input.fullName.trim().slice(0, 160)
    if (!fullName) throw new Error('El nombre es obligatorio')

    await context.payload.update({
      collection: 'leads',
      id: leadId,
      overrideAccess: false,
      user: context.user,
      data: {
        fullName,
        phone: input.phone?.trim() || undefined,
        email: input.email?.trim() || undefined,
        segment: input.segment ?? undefined,
        estimatedValue: input.estimatedValue ?? undefined,
        assignedTo: input.assignedTo ?? undefined,
        notes: input.notes?.trim() || undefined,
      },
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
 * en `conversation-summaries` y lo anexa a las notas del lead. Solo
 * lectura del CRM del tenant activo, igual que `/api/ai/chat` (Hermes).
 */
export async function summarizeLeadWithAIAction(leadId: number): Promise<ActionResult<{ summaryId: number }>> {
  try {
    const { lead, context } = await scopedLead(leadId)
    if (!context.canEdit) throw new Error('No tienes permiso para generar resúmenes de IA')

    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic('claude-3-5-haiku-latest')
      : process.env.OPENAI_API_KEY
        ? openai('gpt-4o-mini')
        : null
    if (!model) throw new Error('Sin proveedor de IA: configura ANTHROPIC_API_KEY u OPENAI_API_KEY')

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
