import type { Payload } from 'payload'

import { findAllPages } from '@/lib/lead-scoring'
import { renderEmailHtml } from '@/email/layout'

// NOTA: este archivo NO debe importar 'server-only': forma parte del grafo de
// imports de payload.config.ts (vía jobs/dispatchSequences.ts) y `pnpm migrate`
// corre fuera de Next (tsx puro), donde ese módulo lanza.

const DAY_MS = 24 * 60 * 60 * 1000

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
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: { status: 'cancelada' },
          overrideAccess: true,
        })
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
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: { status: 'cancelada' },
          overrideAccess: true,
        })
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
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: { status: 'respondida' },
          overrideAccess: true,
        })
        result.stopped++
        continue
      }

      const steps = (sequence.steps ?? []) as SequenceStep[]
      const peek = peekNextAction(steps, Math.max(0, Math.floor(Number(enrollment.currentStep ?? 0))))

      // Solo quedan esperas o el final → completada.
      if (peek.done || peek.actionIndex === null) {
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: { status: 'completada' },
          overrideAccess: true,
        })
        result.completed++
        continue
      }

      // Hay esperas antes del próximo paso: agenda y espera a la próxima pasada.
      if (peek.waitDays > 0) {
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: {
            currentStep: peek.actionIndex,
            nextRunAt: new Date(nowMs + peek.waitDays * DAY_MS).toISOString(),
          },
          overrideAccess: true,
        })
        continue
      }

      // Ejecutar el paso (waitDays === 0). Ejecución idempotente (hallazgo
      // Devin #104-2): si la escritura de avance falla tras el efecto, la
      // próxima pasada re-procesa el paso — los guardas de dedupe (email-log /
      // tasks) hacen que ese reintento sea no-op, sin duplicar el email ni la
      // tarea al lead.
      const step = steps[peek.actionIndex]!
      const nombre = firstName(lead.fullName)
      if (step.type === 'email') {
        // Sin email válido: se omite el paso (avanza); queda trazado como
        // inscripción que no pudo enviar, sin bloquear el resto de la cadena.
        if (!lead.email) {
          result.emailsFailed++
        } else {
          const subject = (step.subject ?? sequence.name).replaceAll('{{nombre}}', nombre).slice(0, 200)
          // Dedupe idempotente: un log de éxito de ESTA inscripción con el
          // mismo asunto significa que el efecto ya ocurrió (avance perdido).
          const dupRes = await payload.find({
            collection: 'email-log',
            limit: 1,
            depth: 0,
            where: {
              and: [
                tenantWhere,
                { lead: { equals: leadId } },
                { source: { equals: 'sequence' } },
                { subject: { equals: subject } },
                { status: { in: ['sent', 'delivered'] } },
                { createdAt: { greater_than_equal: enrollment.createdAt } },
              ],
            },
            overrideAccess: true,
          })
          if (dupRes.docs[0]) {
            // Ya enviado en una pasada anterior cuyo avance se perdió.
          } else {
            const html = renderEmailHtml({
              title: subject,
              bodyHtml: (step.bodyHtml ?? '').replaceAll('{{nombre}}', nombre),
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
            // Log best-effort: si falla la escritura del log NO descontamos el
            // envío ya realizado — se registra el fallo y la inscripción
            // avanza igual (el reintento natural sería un doble envío).
            try {
              await payload.create({
                collection: 'email-log',
                data: {
                  to: lead.email,
                  subject,
                  status: sentOk ? 'sent' : 'failed',
                  source: 'sequence',
                  ...(sentOk ? { providerMessageId: sentId } : { error: 'Fallo enviando paso de secuencia' }),
                  lead: leadId,
                  tenant: tenantId,
                },
                overrideAccess: true,
              })
            } catch (logErr) {
              payload.logger.error({
                msg: 'dispatch-sequences: no se pudo escribir email-log tras el envío',
                enrollmentId: enrollment.id,
                leadId,
                logErr,
              })
            }
            if (sentOk) result.emailsSent++
            else result.emailsFailed++
          }
        }
      } else if (step.type === 'tarea') {
        const assigneeId =
          typeof lead.assignedTo === 'object' ? (lead.assignedTo?.id ?? null) : (lead.assignedTo ?? null)
        const dueDays = Math.max(0, Math.floor(Number(step.taskDueInDays ?? 3)))
        const title = (step.taskTitle ?? `Seguimiento de secuencia: ${lead.fullName}`)
          .replaceAll('{{nombre}}', nombre)
          .slice(0, 180)
        // Dedupe idempotente: misma tarea de secuencia para el lead → ya creada.
        const dupRes = await payload.find({
          collection: 'tasks',
          limit: 1,
          depth: 0,
          where: {
            and: [
              tenantWhere,
              { lead: { equals: leadId } },
              { source: { equals: 'sequence' } },
              { title: { equals: title } },
            ],
          },
          overrideAccess: true,
        })
        if (!dupRes.docs[0]) {
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
            },
            overrideAccess: true,
          })
          result.tasksCreated++
        }
      }

      // Avanzar: consumir esperas posteriores y agendar el próximo ejecutable.
      const after = peekNextAction(steps, peek.actionIndex + 1)
      if (after.done || after.actionIndex === null) {
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: { status: 'completada', currentStep: steps.length },
          overrideAccess: true,
        })
        result.completed++
      } else {
        await payload.update({
          collection: 'sequence-enrollments',
          id: enrollment.id,
          data: {
            currentStep: after.actionIndex,
            nextRunAt: new Date(nowMs + after.waitDays * DAY_MS).toISOString(),
          },
          overrideAccess: true,
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
}
