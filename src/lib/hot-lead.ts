import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'

/**
 * Automatización "lead interesado" (Attio-style): al marcar un lead como
 * 🔥 caliente se encola el brief IA (si no existe) y se crea el recordatorio
 * de llamada. Recuperable e idempotente: cada pieza verifica si falta y se
 * completa de forma independiente — si el job o la tarea fallaron en una
 * pasada anterior, el próximo disparo reintenta solo, sin duplicar
 * recordatorios. Los fallos se registran, no se tragan.
 *
 * Disparadores:
 * - `updateLeadFieldsAction` (crm-pipeline-actions.ts) cuando el agente sube
 *   el nivel de interés a mano.
 * - Job de scoring (`recalculate-lead-scores`) cuando las señales promueven
 *   al lead a caliente: en ese caso no hay usuario actuante y las escrituras
 *   van con overrideAccess (modo sistema, mismo criterio que lead-brief.ts).
 */

interface HotLeadAutomationParams {
  payload: Payload
  tenantId: number
  leadId: number
  leadName: string
  /** Agente destino del recordatorio, ya resuelto por el llamador (null = sin asignar). */
  assigneeId?: number | null
  /** Usuario actuante si viene de una acción user-facing; omitir en jobs del sistema. */
  user?: User
}

export async function runHotLeadAutomation(params: HotLeadAutomationParams): Promise<void> {
  const { payload, tenantId, leadId, leadName, assigneeId, user } = params
  const hotBase = { tenant: { equals: tenantId } }
  const leadFilter = { lead: { equals: leadId } }
  const taskTitle = `📞 Llamar a ${leadName} — marcado como interesado`

  // Brief 360 con IA: solo si todavía no hay ninguno (dedupe). En modo
  // user-facing aplica tope por usuario para no inundar la cola de llamadas
  // pagadas al proveedor; en modo sistema el dedupe por brief existente basta.
  try {
    const briefCount = await payload.count({
      collection: 'lead-briefs',
      where: { and: [hotBase, leadFilter] },
      overrideAccess: true,
    })
    if (briefCount.totalDocs === 0) {
      const allowed = user ? await checkUserActionRateLimit(user.id, 'lead-brief-queue') : true
      if (allowed) {
        await payload.jobs.queue({
          task: 'generate-lead-brief',
          input: { leadId, tenantId },
          overrideAccess: true,
        })
      }
    }
  } catch (err) {
    console.error('[lead-hot] encolando brief IA:', err)
  }

  try {
    // Dedupe por marcador estable (source=auto, no por título): un renombre
    // del lead actualiza el recordatorio existente en vez de crear duplicado.
    const autoReminders = await payload.find({
      collection: 'tasks',
      limit: 1,
      depth: 0,
      sort: '-createdAt',
      where: {
        and: [hotBase, leadFilter, { source: { equals: 'lead_hot' } }],
      },
      overrideAccess: true,
    })
    const existingReminder = autoReminders.docs[0]
    if (existingReminder && existingReminder.title !== taskTitle) {
      await payload.update({
        collection: 'tasks',
        id: existingReminder.id,
        overrideAccess: true,
        data: { title: taskTitle },
      })
    }
    if (!existingReminder) {
      const taskCreateOpts = user
        ? { overrideAccess: false as const, user }
        : { overrideAccess: true as const }
      try {
        await payload.create({
          collection: 'tasks',
          ...taskCreateOpts,
          data: {
            tenant: tenantId,
            title: taskTitle,
            status: 'pendiente',
            priority: 'alta',
            dueDate: new Date(Date.now() + 86_400_000).toISOString(),
            lead: leadId,
            source: 'lead_hot',
            ...(assigneeId != null ? { assignedTo: assigneeId } : {}),
          },
        })
      } catch (err) {
        // Carrera de disparos concurrentes: el índice único parcial
        // (tenant, lead) WHERE source=lead_hot la resuelve — el ganador
        // creó el recordatorio, este disparo simplemente continúa.
        const pgCode = (err as { cause?: { code?: string } }).cause?.code
        if (pgCode !== '23505' && !(err instanceof Error && err.message.includes('duplicate key'))) throw err
      }
    }
  } catch (err) {
    console.error('[lead-hot] creando tarea recordatoria:', err)
  }
}
