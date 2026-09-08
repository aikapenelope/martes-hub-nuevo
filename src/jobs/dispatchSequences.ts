import type { TaskConfig } from 'payload'

import { dispatchTenantSequences } from '@/lib/sequences'
import { findAllPages } from '@/lib/lead-scoring'

/**
 * Dispatch de sequences de email (ítem 2, sector operacional). Cada pasada
 * horaria procesa, por tenant, las inscripciones activas vencidas: ejecuta
 * un paso (email/tarea), consume esperas, y detiene la secuencia si el lead
 * respondió por cualquier canal, fue descartado o convertido. Reglas y
 * máquina de pasos en src/lib/sequences.ts.
 */
export const dispatchSequencesTask: TaskConfig = {
  slug: 'dispatch-sequences' as TaskConfig['slug'],
  label: 'Despacho de sequences de email',
  schedule: [{ cron: '45 * * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'processed', type: 'number' },
    { name: 'emailsSent', type: 'number' },
    { name: 'emailsFailed', type: 'number' },
    { name: 'tasksCreated', type: 'number' },
    { name: 'stopped', type: 'number' },
    { name: 'completed', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    // Paginado completo: el primer page de 100 dejaría tenants sin despacho
    // (mismo hallazgo Devin del scoring).
    const tenants = await findAllPages((page) =>
      req.payload.find({
        collection: 'tenants',
        limit: 100,
        page,
        depth: 0,
        overrideAccess: true,
        req,
      }),
    )

    const totals = {
      processed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      tasksCreated: 0,
      stopped: 0,
      completed: 0,
    }

    for (const tenant of tenants) {
      try {
        const res = await dispatchTenantSequences({ payload: req.payload, tenantId: tenant.id })
        totals.processed += res.processed
        totals.emailsSent += res.emailsSent
        totals.emailsFailed += res.emailsFailed
        totals.tasksCreated += res.tasksCreated
        totals.stopped += res.stopped
        totals.completed += res.completed
      } catch (err) {
        // Un tenant con datos raros no bloquea el barrido del resto.
        req.payload.logger.error({
          msg: 'dispatch-sequences: error en tenant',
          tenantId: tenant.id,
          tenant: tenant.name,
          err,
        })
      }
    }

    const summary = `Procesadas: ${totals.processed} | Emails: ${totals.emailsSent} (fallidos: ${totals.emailsFailed}) | Tareas: ${totals.tasksCreated} | Detenidas: ${totals.stopped} | Completadas: ${totals.completed}`
    req.payload.logger.info({ msg: 'dispatch-sequences completado', summary })

    return { output: { ...totals, summary } }
  },
}
