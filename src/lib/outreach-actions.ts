'use server'

import { revalidatePath } from 'next/cache'

import { generateObject } from 'ai'
import { getScopedLead } from '@/lib/crm-scoped-entities'
import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Prospección manual por WhatsApp: mensajes pre-escritos personalizados que
 * el agente copia y envía POR FUERA con el enlace wa.me — sin envíos
 * automáticos (el broadcast vía OpenBSP queda para el futuro).
 */

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

/**
 * Mensaje de salida personalizado para un lead interesado, generado con la
 * IA del tenant usando su contexto (servicio, persona, notas, llamadas).
 */
export async function generateOutreachMessageAction(leadId: number): Promise<ActionResult<{ message: string }>> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para generar mensajes')
  const { lead } = await getScopedLead(leadId)

  const { getTenantAiModel } = await import('@/lib/ai-provider')
  const ai = await getTenantAiModel(context.payload, context.tenantId)
  if (!ai) {
    return { ok: false, error: 'IA no configurada — define proveedor y API key en Ajustes' }
  }

  const contexto = [
    `Nombre: ${lead.fullName}`,
    `Servicio de interés: ${lead.servicioInteres ?? 'n/a'}`,
    `Persona de interés: ${lead.personaInteres ?? 'n/a'}`,
    `Nivel de interés: ${lead.nivelInteres ?? 'sin definir'}`,
    `Llamadas previas: ${lead.numeroDeLlamadas ?? 0} | Última: ${lead.lastContactedAt ?? 'nunca'}`,
    `Notas de llamada: ${String(lead.notasLlamada ?? 'n/a').slice(0, 400)}`,
    `Notas internas: ${String(lead.notes ?? 'n/a').slice(0, 400)}`,
    `Comentarios comerciales: ${String(lead.commercialNotes ?? 'n/a').slice(0, 400)}`,
  ].join('\n')

  try {
    const { object } = await generateObject({
      model: ai.model,
      schema: (await import('zod')).z.object({
        mensaje: (await import('zod')).z
          .string()
          .describe('Mensaje de WhatsApp personalizado en español, tono humano y cercano, máx 500 caracteres'),
      }),
      prompt: [
        'Escribe el mensaje de WhatsApp para retomar contacto con este prospecto interesado.',
        'Personalízalo con su contexto real (servicio, persona, últimas interacciones); nada de plantillas genéricas.',
        'Corto, humano, con un llamado a la acción claro (agendar visita o llamada).',
        '',
        contexto,
      ].join('\n'),
    })
    return { ok: true, message: object.mensaje }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error generando el mensaje' }
  }
}

/** Marca el lead como contactado: registra actividad WhatsApp y actualiza contadores. */
export async function markLeadContactedAction(leadId: number): Promise<ActionResult<{ numeroDeLlamadas: number | null }>> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para actualizar leads')
  const { lead } = await getScopedLead(leadId)

  const now = new Date().toISOString()
  const prevCount = typeof lead.numeroDeLlamadas === 'number' ? lead.numeroDeLlamadas : 0

  await context.payload.update({
    collection: 'leads',
    id: leadId,
    overrideAccess: false,
    user: context.user,
    data: {
      lastContactedAt: now,
      numeroDeLlamadas: prevCount + 1,
      lastContactChannel: 'whatsapp',
    },
  })

  await context.payload.create({
    collection: 'activities',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      type: 'whatsapp',
      summary: 'Mensaje enviado manualmente por WhatsApp (prospección)',
      occurredAt: now,
      lead: leadId,
      performedBy: context.user.id,
    },
  })

  revalidatePath('/workspace/outreach')
  revalidatePath('/workspace/crm')
  return { ok: true, numeroDeLlamadas: prevCount + 1 }
}
