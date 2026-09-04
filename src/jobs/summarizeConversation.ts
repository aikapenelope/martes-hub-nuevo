import type { TaskConfig } from 'payload'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getTenantAiModel, getTenantAiConfig } from '../lib/ai-provider'
import type { Message, Conversation } from '@/payload-types'

const AI_DIGEST_SCHEMA = z.object({
  title: z.string().describe('Título o asunto conciso del estado de la conversación (ej: Consulta de precios y condiciones)'),
  summary: z.string().describe('Resumen ejecutivo de la interacción en español, 2-4 frases clave sin rodeos'),
  sentiment: z.enum(['positivo', 'neutral', 'negativo', 'en_riesgo']).describe('Sentimiento general detectado en el cliente/lead'),
  objections: z.string().optional().describe('Objeciones o dudas detectadas: precio, tiempos, desconfianza, etc.'),
  nextSteps: z.string().optional().describe('Próximos pasos recomendados para el equipo de ventas/atención'),
  budgetExpectation: z.string().optional().describe('Expectativa presupuestaria o capacidad económica deducida si se mencionó'),
  keyTopics: z.array(z.string()).optional().describe('2 a 5 conceptos o temas clave tratados'),
})

export const summarizeConversationTask: TaskConfig = {
  slug: 'summarize-conversation',
  label: 'Resumen y perfilado IA de conversación',
  inputSchema: [
    { name: 'conversationId', type: 'number', required: true },
    { name: 'tenantId', type: 'number', required: true },
    { name: 'trigger', type: 'text' },
  ],
  outputSchema: [
    { name: 'summaryId', type: 'number' },
    { name: 'skippedReason', type: 'text' },
  ],
  handler: async ({ input, req }) => {
    const rawInput = (input ?? {}) as Record<string, unknown>
    const conversationId = Number(rawInput.conversationId)
    const tenantId = Number(rawInput.tenantId)
    const trigger = String(rawInput.trigger || 'manual')

    if (!Number.isInteger(conversationId) || !Number.isInteger(tenantId)) {
      throw new Error('Parámetros inválidos para summarize-conversation (conversationId y tenantId requeridos)')
    }

    // 1. Verificar si el tenant tiene auto-resumen habilitado (si el trigger es inbound_message)
    const tenantConfig = await getTenantAiConfig(req.payload, tenantId)
    if (trigger === 'inbound_message' && !tenantConfig.autoSummarize) {
      return { output: { skippedReason: 'Auto-resumen deshabilitado para este tenant' } }
    }

    // 2. Obtener conversación
    const conversation = (await req.payload.findByID({
      collection: 'conversations',
      id: conversationId,
      depth: 1,
      overrideAccess: true,
      req,
    })) as Conversation | null

    if (!conversation) {
      return { output: { skippedReason: `Conversación ${conversationId} no encontrada` } }
    }

    // 3. Verificar idempotencia: si ya existe un resumen posterior al último mensaje, saltar
    if (conversation.lastMessageAt) {
      const recentSummaries = await req.payload.find({
        collection: 'conversation-summaries',
        where: {
          and: [
            { tenant: { equals: tenantId } },
            { conversation: { equals: conversationId } },
          ],
        },
        limit: 1,
        depth: 0,
        sort: '-createdAt',
        overrideAccess: true,
        req,
      })

      const lastSummary = recentSummaries.docs[0]
      if (lastSummary && new Date(lastSummary.createdAt) >= new Date(conversation.lastMessageAt)) {
        return { output: { skippedReason: 'La conversación ya tiene un resumen actualizado para sus mensajes' } }
      }
    }

    // 4. Obtener mensajes recientes (hasta 25 mensajes para contexto óptimo)
    const messagesRes = await req.payload.find({
      collection: 'messages',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { conversation: { equals: conversationId } },
        ],
      },
      limit: 25,
      depth: 0,
      sort: '-sentAt',
      overrideAccess: true,
      req,
    })

    const messages = (messagesRes.docs as Message[]).slice().reverse()
    if (messages.length < 2) {
      return { output: { skippedReason: 'Menos de 2 mensajes: insuficiente para generar un resumen con valor' } }
    }

    // 5. Resolver modelo de IA para el tenant (Groq / OpenRouter / Custom / Fallback)
    const resolvedAi = await getTenantAiModel(req.payload, tenantId)
    if (!resolvedAi) {
      req.payload.logger.warn({
        msg: 'summarize-conversation: omitido por falta de proveedor o API key de IA',
        tenantId,
        conversationId,
      })
      return { output: { skippedReason: 'Sin proveedor de IA configurado para este tenant ni variables de entorno disponibles' } }
    }

    // 6. Preparar transcripción
    const contactIdentifier = conversation.contactAddress || 'Contacto'
    const transcript = messages
      .map((m) => {
        const role = m.direction === 'inbound' ? 'Cliente' : 'Agente'
        const body = m.text || `[Archivo adjunto: ${m.type}]`
        return `${role}: ${body}`
      })
      .join('\n')

    // 7. Invocación estructurada a Vercel AI SDK
    const prompt = `Analiza la siguiente conversación de ${conversation.channel || 'WhatsApp'} con el contacto "${contactIdentifier}".
Extrae un resumen ejecutivo claro, sentimiento, objeciones detectadas y próximos pasos comerciales recomendados.

Conversación:
${transcript}`

    const { object } = await generateObject({
      model: resolvedAi.model,
      schema: AI_DIGEST_SCHEMA,
      system:
        'Eres el analista de inteligencia de clientes de Martes Hub. Tu rol es pre-digerir y perfilar conversaciones comerciales en español para que los agentes humanos y autónomos tengan contexto inmediato. Sé objetivo, preciso y profesional.',
      prompt,
    })

    // Extraer IDs vinculados (cliente / lead)
    const clientId =
      typeof conversation.client === 'object' && conversation.client ? conversation.client.id : conversation.client
    const leadId =
      typeof conversation.lead === 'object' && conversation.lead ? conversation.lead.id : conversation.lead

    // 8. Crear el resumen en conversation-summaries
    const summaryDoc = await req.payload.create({
      collection: 'conversation-summaries',
      data: {
        title: object.title || `Resumen IA — ${contactIdentifier}`,
        conversation: conversationId,
        ...(clientId ? { client: clientId } : {}),
        ...(leadId ? { lead: leadId } : {}),
        summary: object.summary,
        sentiment: object.sentiment,
        objections: object.objections,
        nextSteps: object.nextSteps,
        budgetExpectation: object.budgetExpectation,
        keyTopics: (object.keyTopics || []).map((t) => ({ topic: t })),
        generatedBy: 'hermes_ai',
        rawAiResponse: {
          provider: resolvedAi.provider,
          model: resolvedAi.modelName,
          generatedAt: new Date().toISOString(),
          trigger,
        },
        tenant: tenantId,
      },
      overrideAccess: true,
      req,
    })

    // 9. Crear nota interna en conversation-notes para visibilidad inmediata en el Inbox
    const noteContent = [
      `🤖 **[Auto-Digest IA (${resolvedAi.provider})]**`,
      object.summary,
      object.objections ? `\n• **Objeciones:** ${object.objections}` : '',
      object.nextSteps ? `• **Próximos pasos:** ${object.nextSteps}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    await req.payload.create({
      collection: 'conversation-notes',
      data: {
        conversation: conversationId,
        body: noteContent,
        tenant: tenantId,
      },
      overrideAccess: true,
      req,
    })

    // 10. Actualizar notas y registrar actividad en Lead / Cliente si aplica
    const nowIso = new Date().toISOString()
    const formattedDate = new Date().toLocaleDateString('es-ES')

    if (leadId) {
      const leadDoc = await req.payload.findByID({
        collection: 'leads',
        id: leadId,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (leadDoc) {
        const updatedNotes = [leadDoc.notes, `[IA ${formattedDate}] ${object.summary}`]
          .filter(Boolean)
          .join('\n\n')

        await req.payload.update({
          collection: 'leads',
          id: leadId,
          data: { notes: updatedNotes },
          overrideAccess: true,
          req,
        })

        await req.payload.create({
          collection: 'activities',
          data: {
            tenant: tenantId,
            type: 'nota',
            occurredAt: nowIso,
            summary: `Resumen de IA generado (${resolvedAi.provider}/${resolvedAi.modelName})`,
            lead: leadId,
          },
          overrideAccess: true,
          req,
        })
      }
    } else if (clientId) {
      const clientDoc = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (clientDoc) {
        const updatedNotes = [clientDoc.notes, `[IA ${formattedDate}] ${object.summary}`]
          .filter(Boolean)
          .join('\n\n')

        await req.payload.update({
          collection: 'clients',
          id: clientId,
          data: { notes: updatedNotes },
          overrideAccess: true,
          req,
        })

        await req.payload.create({
          collection: 'activities',
          data: {
            tenant: tenantId,
            type: 'nota',
            occurredAt: nowIso,
            summary: `Resumen de IA generado (${resolvedAi.provider}/${resolvedAi.modelName})`,
            client: clientId,
          },
          overrideAccess: true,
          req,
        })
      }
    }

    req.payload.logger.info({
      msg: 'summarize-conversation: resumen generado exitosamente',
      conversationId,
      summaryId: summaryDoc.id,
      provider: resolvedAi.provider,
      model: resolvedAi.modelName,
    })

    return { output: { summaryId: summaryDoc.id, skippedReason: '' } }
  },
}
