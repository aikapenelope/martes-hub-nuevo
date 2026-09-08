import type { Payload } from 'payload'

import { findAllPages } from '@/lib/lead-scoring'
import { sanitizeCampaignHtml } from '@/email/sanitize'
import { renderEmailHtml } from '@/email/layout'

// NOTA: este archivo NO debe importar 'server-only': forma parte del grafo de
// imports de payload.config.ts (vía jobs/dispatchSequences.ts) y `pnpm migrate`
// corre fuera de Next (tsx puro), donde ese módulo lanza.

const DAY_MS = 24 * 60 * 60 * 1000
// Reintento de email fallido: en la próxima pasada horaria (hallazgo Devin
// #104-3: un fallo del proveedor no salta el paso para siempre).
const EMAIL_RETRY_MS = 60 * 60 * 1000
// Techo de reintentos por paso: agotados, la inscripción avanza (política
// terminal explícita) y el intento queda trazado en email-log como failed.
const MAX_EMAIL_ATTEMPTS = 3
// Ventana del claim: mientras se ejecuta el efecto externo, nextRunAt queda
// empujado unos minutos; si el proceso muere a mitad de paso, la próxima
// pasada lo retoma sin duplicar despachos concurrentes.
const CLAIM_MS = 5 * 60 * 1000

export type SequenceStepType = 'email' | 'tarea' | 'esperar'

export interface SequenceStep {
  type: SequenceStepType
  subject?: string | null
  bodyHtml?: string | null
  taskTitle?: string | null
  taskDueInDays?: number | null
  days?: number | null
}

/** De dónde sigue la secuencia a partir de un índice: salta pasos 'esperar' acumulando días. */
export interface ResolvedNext {
  /** true si no quedan pasos ejecutables (solo esperas o fin) → inscripción completada. */
  done: boolean
  /** Días acumulados de pasos 'esperar' antes del próximo paso ejecutable. */
  waitDays: number
  /** Índice del próximo paso ejecutable (email/tarea); null si done. */
  actionIndex: number | null
}

/**
 * Máquina de pasos de la secuencia (pura, testeable): desde `fromIndex`,
 * consume pasos 'esperar' (cada uno aporta sus días, mínimo 1) y se detiene
 * en el primer paso email/tarea. Si no hay más pasos ejecutables, done.
 */
export function peekNextAction(steps: SequenceStep[], fromIndex: number): ResolvedNext {
  let waitDays = 0
  for (let i = Math.max(fromIndex, 0); i < steps.length; i++) {
    const step = steps[i]
    if (step?.type === 'esperar') {
      waitDays += Math.max(1, Math.floor(Number(step.days) || 1))
      continue
    }
    return { done: false, waitDays, actionIndex: i }
  }
  return { done: true, waitDays, actionIndex: null }
}

/** ¿Hubo respuesta del lead (inbound en cualquier canal) posterior a `sinceIso`? */
export function repliedSince(lastInboundAt: string | null | undefined, sinceIso: string): boolean {
  if (!lastInboundAt) return false
  const inboundMs = Date.parse(lastInboundAt)
  if (!Number.isFinite(inboundMs)) return false
  return inboundMs > Date.parse(sinceIso)
}

/**
 * Validación server-side del campo days (hallazgo Devin #104-1):
 * admin.condition solo controla visibilidad en el admin — la validación
 * corre siempre, así que 'required' fijo bloquearía el guardado de pasos
 * email/tarea. El campo se valida aquí según el tipo del paso.
 */
export function validateSequenceStepDays(value: unknown, stepType: unknown): true | string {
  if (stepType !== 'esperar') return true
  const raw = value
  if (raw === undefined || raw === null || raw === '') {
    return 'Los pasos esperar requieren un número de días (1-90)'
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1 || n > 90 || Math.floor(n) !== n) {
    return 'Los días deben ser un entero entre 1 y 90'
  }
  return true
}

/**
 * Validación de contenido por tipo (hallazgo Devin #104 SEC-2): un paso email
 * sin asunto/cuerpo manda emails vacíos y una tarea sin título crea tareas
 * con fallback. Igual que days: server-side, no admin.condition.
 */
export function makeSequenceStepRequiredValidator(
  label: string,
  types: readonly SequenceStepType[],
): (value: unknown, options: { siblingData?: Record<string, unknown> }) => true | string {
  return (value, { siblingData }) => {
    if (!types.includes(siblingData?.type as SequenceStepType)) return true
    if (typeof value === 'string' && value.trim().length > 0) return true
    return `Este paso requiere ${label}`
  }
}

/**
 * ¿Cambió la ESTRUCTURA de los pasos (agregar, quitar, reordenar o cambiar
 * el tipo)? Los arreglos de Payload conservan el id de cada fila existente,
 * así que comparar la lista ordenada de (id, tipo) distingue una edición de
 * contenido de una estructural (hallazgo Devin #104-5: un currentStep
 * numérico sobre un arreglo mutable repite o salta pasos si la estructura
 * cambia con inscripciones activas).
 */
export function stepsChangedStructurally(original: unknown, incoming: unknown): boolean {
  if (!Array.isArray(incoming)) return false
  if (!Array.isArray(original)) return false
  const fingerprint = (rows: unknown[]): string =>
    JSON.stringify(rows.map((r) => [String((r as { id?: unknown })?.id ?? ''), String((r as { type?: unknown })?.type ?? '')]))
  return fingerprint(original) !== fingerprint(incoming)
}

export interface DispatchTenantSequencesResult {
  processed: number
  emailsSent: number
  emailsFailed: number
  tasksCreated: number
  stopped: number
  completed: number
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

interface InboundRef {
  leadId: number
  lastInboundAt: string
}

function isUniqueViolation(err: unknown): boolean {
  const pgCode = (err as { cause?: { code?: string } })?.cause?.code
  return pgCode === '23505' || (err instanceof Error && err.message.includes('duplicate key'))
}

/**
 * Transición condicional de una inscripción ACTIVA del tenant: el UPDATE solo
 * aplica si sigue 'activa'. Devuelve false si ya no lo está (el agente la
 * canceló durante el proceso) — el despacho jamás pisa una cancelación
 * posterior (hallazgo Devin #104-4).
 */
async function updateActiveEnrollment(
  payload: Payload,
  enrollmentId: number,
  tenantId: number,
  data: Record<string, unknown>,
): Promise<boolean> {
  const res = await payload.update({
    collection: 'sequence-enrollments',
    where: {
      and: [
        { id: { equals: enrollmentId } },
        { tenant: { equals: tenantId } },
        { status: { equals: 'activa' } },
      ],
    },
    data,
    overrideAccess: true,
  })
  return Array.isArray(res.docs) && res.docs.length > 0
}

/**
 * Barrido tenant-scoped del job dispatch-sequences. Procesa inscripciones
 * activas cuyo nextRunAt venció: un paso por inscripción por pasada.
 *
 * Stop de la secuencia (hallazgo de producto 2026-09-08):
 * - Lead respondió por WhatsApp (conversations.lastInboundAt) o email
 *   (email-messages inbound) DESPUÉS de inscribirse → 'respondida'.
 * - Lead descartado o convertido → 'cancelada'.
 * - Secuencia desactivada → se omite sin cambiar estado (se reanuda si se
 *   reactiva).
 *
 * Semántica de ejecución:
 * - Claim atómico ANTES del efecto: un UPDATE condicional a status='activa'
 *   empuja nextRunAt; si la inscripción fue cancelada en el ínterin, no
 *   matchea y el paso no se envía (hallazgo Devin #104-4).
 * - Identidad estable del paso (enrollmentId, stepIndex) persistida en
 *   email-log y tasks con índice único parcial — la dedupe NO depende del
 *   asunto/título, así que pasos con contenido repetido no se suprimen entre
 *   sí (hallazgo Devin #104-2 ronda 2).
 * - At-most-once: el marcador del paso se escribe 'queued' ANTES de llamar al
 *   proveedor; un envío confirmado que pierde su escritura de avance nunca se
 *   reenvía (hallazgo Devin #104-2) y un fallo del proveedor reintenta hasta
 *   MAX_EMAIL_ATTEMPTS sin avanzar la inscripción (hallazgo Devin #104-3).
 *
 * Job del sistema: escrituras con overrideAccess, tenant explícito en cada
 * where, paginación completa de todas las lecturas (findAllPages).
 */
export async function dispatchTenantSequences({
  payload,
  tenantId,
}: {
  payload: Payload
  tenantId: number
}): Promise<DispatchTenantSequencesResult> {
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()
  const tenantWhere = { tenant: { equals: tenantId } }

  const result: DispatchTenantSequencesResult = {
    processed: 0,
    emailsSent: 0,
    emailsFailed: 0,
    tasksCreated: 0,
    stopped: 0,
    completed: 0,
  }

  // Señales de respuesta por lead (más reciente por lead): WhatsApp + email.
  const lastInboundByLead = new Map<number, string>()
  const conversations = await findAllPages((page) =>
    payload.find({
      collection: 'conversations',
      where: tenantWhere,
      limit: 500,
      page,
      depth: 0,
      select: { lead: true, lastInboundAt: true },
      overrideAccess: true,
    }),
  )
  for (const conv of conversations) {
    const leadId = typeof conv.lead === 'object' ? conv.lead?.id : conv.lead
    if (!leadId || !conv.lastInboundAt) continue
    const prev = lastInboundByLead.get(leadId)
    if (!prev || Date.parse(conv.lastInboundAt) > Date.parse(prev)) {
      lastInboundByLead.set(leadId, conv.lastInboundAt)
    }
  }
  const inboundEmails: InboundRef[] = []
  const emailMessages = await findAllPages((page) =>
    payload.find({
      collection: 'email-messages',
      where: { and: [tenantWhere, { direction: { equals: 'inbound' } }] },
      limit: 500,
      page,
      depth: 0,
      select: { lead: true, date: true },
      overrideAccess: true,
    }),
  )
  for (const msg of emailMessages) {
    const leadId = typeof msg.lead === 'object' ? msg.lead?.id : msg.lead
    if (!leadId || !msg.date) continue
    inboundEmails.push({ leadId, lastInboundAt: msg.date })
  }

  // Inscripciones vencidas (paginado completo; limit 100 por pasada de job
  // para acotar el trabajo de cada corrida horaria).
  const enrollments = await findAllPages((page) =>
    payload.find({
      collection: 'sequence-enrollments',
      where: {
        and: [
          tenantWhere,
          { status: { equals: 'activa' } },
          { nextRunAt: { less_than_equal: nowIso } },
        ],
      },
      limit: 100,
      page,
      depth: 1,
      sort: 'nextRunAt',
      overrideAccess: true,
    }),
  )

  for (const enrollment of enrollments) {
    try {
      result.processed++

      const sequenceId =
        typeof enrollment.sequence === 'object' ? enrollment.sequence?.id : enrollment.sequence
      const leadIdRaw = typeof enrollment.lead === 'object' ? enrollment.lead?.id : enrollment.lead
      if (!sequenceId || !leadIdRaw) {
        await updateActiveEnrollment(payload, enrollment.id, tenantId, { status: 'cancelada' })
        result.stopped++
        continue
      }
      const leadId = leadIdRaw

      // Secuencia del MISMO tenant (validación anti cross-tenant aunque la
      // relación venga poblada por depth: 1).
      const seqRes = await payload.find({
        collection: 'sequences',
        limit: 1,
        depth: 0,
        where: { and: [{ id: { equals: sequenceId } }, tenantWhere] },
        overrideAccess: true,
      })
      const sequence = seqRes.docs[0]
      // Secuencia inactiva: pausa implícita, se reanuda al reactivarla.
      if (!sequence || sequence.active === false) continue

      // Stops por estado del lead: descartado o convertido.
      const leadRes = await payload.find({
        collection: 'leads',
        limit: 1,
        depth: 0,
        where: { and: [{ id: { equals: leadId } }, tenantWhere] },
        select: {
          fullName: true,
          email: true,
          status: true,
          convertedClient: true,
          assignedTo: true,
        },
        overrideAccess: true,
      })
      const lead = leadRes.docs[0]
      if (
        !lead ||
        lead.status === 'descartado' ||
        (typeof lead.convertedClient === 'object' ? Boolean(lead.convertedClient) : Boolean(lead.convertedClient))
      ) {
        await updateActiveEnrollment(payload, enrollment.id, tenantId, { status: 'cancelada' })
        result.stopped++
        continue
      }

      // Stop por respuesta en cualquier canal posterior a la inscripción.
      const waInbound = lastInboundByLead.get(leadId)
      const emailInbound = inboundEmails
        .filter((m) => m.leadId === leadId)
        .reduce<string | null>(
          (max, m) => (!max || Date.parse(m.lastInboundAt) > Date.parse(max) ? m.lastInboundAt : max),
          null,
        )
      if (
        repliedSince(waInbound, enrollment.createdAt) ||
        repliedSince(emailInbound, enrollment.createdAt)
      ) {
        await updateActiveEnrollment(payload, enrollment.id, tenantId, { status: 'respondida' })
        result.stopped++
        continue
      }

      const steps = (sequence.steps ?? []) as SequenceStep[]
      const peek = peekNextAction(steps, Math.max(0, Math.floor(Number(enrollment.currentStep ?? 0))))

      // Solo quedan esperas o el final → completada.
      if (peek.done || peek.actionIndex === null) {
        if (await updateActiveEnrollment(payload, enrollment.id, tenantId, { status: 'completada' })) {
          result.completed++
        }
        continue
      }

      // Hay esperas antes del próximo paso: agenda y espera a la próxima pasada.
      if (peek.waitDays > 0) {
        await updateActiveEnrollment(payload, enrollment.id, tenantId, {
          currentStep: peek.actionIndex,
          nextRunAt: new Date(nowMs + peek.waitDays * DAY_MS).toISOString(),
        })
        continue
      }

      // Claim atómico antes de cualquier efecto externo: si la inscripción ya
      // no está activa (cancelada mientras leíamos), el UPDATE no matchea y el
      // paso no se ejecuta.
      const claimed = await updateActiveEnrollment(payload, enrollment.id, tenantId, {
        nextRunAt: new Date(nowMs + CLAIM_MS).toISOString(),
      })
      if (!claimed) continue

      // Ejecutar el paso (waitDays === 0). Reintento idempotente por
      // identidad: si la escritura de avance falla tras el efecto, la próxima
      // pasada encuentra el marcador (enrollmentId, stepIndex) y solo avanza.
      const step = steps[peek.actionIndex]!
      const nombre = firstName(lead.fullName)
      if (step.type === 'email') {
        // Sin email válido: se omite el paso (avanza); queda trazado como
        // inscripción que no pudo enviar, sin bloquear el resto de la cadena.
        if (!lead.email) {
          await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
          continue
        }
        const subject = (step.subject ?? sequence.name).replaceAll('{{nombre}}', nombre).slice(0, 200)
        // Marcador de identidad de ESTA inscripción y ESTE paso.
        const markerRes = await payload.find({
          collection: 'email-log',
          limit: 1,
          depth: 0,
          where: {
            and: [
              tenantWhere,
              { source: { equals: 'sequence' } },
              { sequenceEnrollmentId: { equals: enrollment.id } },
              { sequenceStepIndex: { equals: peek.actionIndex } },
            ],
          },
          overrideAccess: true,
        })
        const marker = markerRes.docs[0]
        const markerStatus = marker?.status
        // Enviado (o confirmado por webhook) en una pasada anterior cuyo
        // avance se perdió → no reenviar, solo avanzar.
        if (markerStatus === 'sent' || markerStatus === 'delivered') {
          await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
          continue
        }
        // 'queued' = el envío fue reclamado y no hay confirmación (proceso
        // muerto entre el marcador y la confirmación, o escritura de estado
        // perdida). Política at-most-once: no se reenvía.
        if (markerStatus === 'queued') {
          await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
          continue
        }

        // Reclamar el paso con el marcador ANTES de llamar al proveedor. El
        // índice único parcial (source='sequence') garantiza a lo sumo un
        // marcador por (inscripción, paso) aunque corran dos despachos.
        let markerId: number | string | undefined = marker?.id
        if (markerId == null) {
          try {
            const created = (await payload.create({
              collection: 'email-log',
              data: {
                to: lead.email,
                subject,
                status: 'queued',
                source: 'sequence',
                sequenceEnrollmentId: enrollment.id,
                sequenceStepIndex: peek.actionIndex,
                lead: leadId,
                tenant: tenantId,
              },
              overrideAccess: true,
            })) as { id?: number | string }
            markerId = created?.id
          } catch (err) {
            if (isUniqueViolation(err)) {
              // Otro despacho lo reclamó primero: no reenviar.
              await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
              continue
            }
            throw err
          }
          if (markerId == null) {
            // Sin marcador no hay envío seguro: se reintenta en la próxima pasada.
            payload.logger.error({
              msg: 'dispatch-sequences: email-log queued no devolvió id',
              enrollmentId: enrollment.id,
              leadId,
            })
            continue
          }
        } else {
          // Reintento de un intento fallido: volver a 'queued' mientras vuela.
          await payload.update({
            collection: 'email-log',
            id: markerId,
            data: { status: 'queued', error: null },
            overrideAccess: true,
          })
        }

        const html = renderEmailHtml({
          title: subject,
          bodyHtml: sanitizeCampaignHtml((step.bodyHtml ?? '').replaceAll('{{nombre}}', nombre)),
        })
        let sentId: string | undefined
        let sentOk = true
        try {
          const sent = (await payload.sendEmail({
            to: lead.email,
            subject,
            html,
          })) as { id?: string } | null | undefined
          sentId = sent?.id
        } catch {
          sentOk = false
        }

        // Confirmar el marcador: si esta escritura falla, el marcador queda
        // 'queued' y la próxima pasada avanza sin reenviar (at-most-once).
        try {
          await payload.update({
            collection: 'email-log',
            id: markerId,
            data: sentOk
              ? { status: 'sent', providerMessageId: sentId, error: null }
              : { status: 'failed', error: 'Fallo enviando paso de secuencia' },
            overrideAccess: true,
          })
        } catch (logErr) {
          payload.logger.error({
            msg: 'dispatch-sequences: no se pudo confirmar email-log tras el envío',
            enrollmentId: enrollment.id,
            leadId,
            logErr,
          })
        }

        if (sentOk) {
          result.emailsSent++
          await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
        } else {
          result.emailsFailed++
          const attempts = Math.max(0, Math.floor(Number(enrollment.stepAttempts ?? 0))) + 1
          if (attempts < MAX_EMAIL_ATTEMPTS) {
            // Reintento acotado: la inscripción NO avanza; reprogramada.
            await updateActiveEnrollment(payload, enrollment.id, tenantId, {
              nextRunAt: new Date(nowMs + EMAIL_RETRY_MS).toISOString(),
              stepAttempts: attempts,
            })
          } else {
            // Política terminal: agotados los reintentos, la cadena sigue
            // (el intento queda trazado como failed en email-log).
            await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
          }
        }
      } else if (step.type === 'tarea') {
        const assigneeId =
          typeof lead.assignedTo === 'object' ? (lead.assignedTo?.id ?? null) : (lead.assignedTo ?? null)
        const dueDays = Math.max(0, Math.floor(Number(step.taskDueInDays ?? 3)))
        const title = (step.taskTitle ?? `Seguimiento de secuencia: ${lead.fullName}`)
          .replaceAll('{{nombre}}', nombre)
          .slice(0, 180)
        // Dedupe por identidad (no por título): pasos de tarea con el mismo
        // título en la misma secuencia siguen creando su tarea cada uno.
        const dupRes = await payload.find({
          collection: 'tasks',
          limit: 1,
          depth: 0,
          where: {
            and: [
              tenantWhere,
              { source: { equals: 'sequence' } },
              { sequenceEnrollmentId: { equals: enrollment.id } },
              { sequenceStepIndex: { equals: peek.actionIndex } },
            ],
          },
          overrideAccess: true,
        })
        if (!dupRes.docs[0]) {
          try {
            await payload.create({
              collection: 'tasks',
              data: {
                tenant: tenantId,
                title,
                status: 'pendiente',
                priority: 'media',
                dueDate: new Date(nowMs + dueDays * DAY_MS).toISOString(),
                lead: leadId,
                ...(assigneeId != null ? { assignedTo: assigneeId } : {}),
                source: 'sequence',
                sequenceEnrollmentId: enrollment.id,
                sequenceStepIndex: peek.actionIndex,
              },
              overrideAccess: true,
            })
            result.tasksCreated++
          } catch (err) {
            // Carrera de dobles despachos: el índice único parcial la resuelve.
            if (!isUniqueViolation(err)) throw err
          }
        }
        await advanceAfterStep(payload, enrollment.id, tenantId, steps, peek.actionIndex, nowMs)
      } else {
        // Paso desconocido (dato corrupto): suelta el claim sin ciclar.
        await updateActiveEnrollment(payload, enrollment.id, tenantId, {
          nextRunAt: new Date(nowMs + DAY_MS).toISOString(),
        })
      }
    } catch (err) {
      // Una inscripción con datos raros no bloquea el resto del barrido.
      payload.logger.error({
        msg: 'dispatch-sequences: error procesando inscripción',
        enrollmentId: enrollment.id,
        tenantId,
        err,
      })
    }
  }

  return result

  /** Avanza al próximo paso ejecutable o completa la inscripción (solo si sigue activa). */
  async function advanceAfterStep(
    payload: Payload,
    enrollmentId: number,
    tenantId: number,
    steps: SequenceStep[],
    executedIndex: number,
    nowMs: number,
  ): Promise<void> {
    const after = peekNextAction(steps, executedIndex + 1)
    if (after.done || after.actionIndex === null) {
      await updateActiveEnrollment(payload, enrollmentId, tenantId, {
        status: 'completada',
        currentStep: steps.length,
        stepAttempts: 0,
      })
      result.completed++
      return
    }
    await updateActiveEnrollment(payload, enrollmentId, tenantId, {
      currentStep: after.actionIndex,
      nextRunAt: new Date(nowMs + after.waitDays * DAY_MS).toISOString(),
      stepAttempts: 0,
    })
  }
}
