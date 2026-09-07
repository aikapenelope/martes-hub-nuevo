'use server'

import { revalidatePath } from 'next/cache'
import type { PayloadRequest } from 'payload'

import { generateObject } from 'ai'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
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
  // Rate limit: la generación consume tokens del proveedor del tenant
  if (!(await checkUserActionRateLimit(context.user.id, 'outreach-message'))) {
    return { ok: false, error: 'Demasiados mensajes generados seguidos — espera un minuto' }
  }
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
        // Límite FORZADO (no solo descriptivo): el mensaje viaja al navegador
        // y a la construcción de la URL wa.me — una salida sobredimensionada
        // no puede llegar intacta.
        mensaje: (await import('zod')).z
          .string()
          .max(700)
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
    return { ok: true, message: object.mensaje.trim().slice(0, 700) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error generando el mensaje' }
  }
}

/** Marca el lead como contactado: actualiza última conexión y registra la actividad WhatsApp. NO toca `numeroDeLlamadas` — ese campo cuenta solo llamadas telefónicas. */
export async function markLeadContactedAction(leadId: number): Promise<ActionResult> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para actualizar leads')
  // Validación de pertenencia al tenant activo
  await getScopedLead(leadId)

  const now = new Date().toISOString()

  // Transacción: la actualización del lead y su actividad de timeline se
  // confirman juntas — un fallo a mitad hace rollback de ambas.
  const transactionReq = {
    payload: context.payload,
    user: context.user,
  } as unknown as PayloadRequest
  const transactionID = await context.payload.db.beginTransaction()
  if (transactionID) transactionReq.transactionID = transactionID

  try {
    await context.payload.update({
      collection: 'leads',
      id: leadId,
      overrideAccess: false,
      user: context.user,
      req: transactionReq,
      data: {
        lastContactedAt: now,
        lastContactChannel: 'whatsapp',
      },
    })

    await context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      req: transactionReq,
      data: {
        tenant: context.tenantId,
        type: 'whatsapp',
        summary: 'Mensaje enviado manualmente por WhatsApp (prospección)',
        occurredAt: now,
        lead: leadId,
        performedBy: context.user.id,
      },
    })

    if (transactionID) await context.payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID) await context.payload.db.rollbackTransaction(transactionID)
    throw err
  }

  revalidatePath('/workspace/outreach')
  revalidatePath('/workspace/crm')
  return { ok: true }
}
