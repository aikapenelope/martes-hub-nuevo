import type { TaskConfig } from 'payload'

import { findAllPages, scoreTenantLeads } from '@/lib/lead-scoring'

/**
 * Scoring automático de leads: recalcula nivelInteres/prioridad desde las
 * señales ya capturadas (inbound WhatsApp, sentimiento de summaries, llamadas,
 * SLA por etapa) y escribe al lead. Cuando un lead sube a 🔥 caliente dispara
 * la automatización hot-lead existente (brief IA + recordatorio de llamada).
 * Fórmula y umbrales en src/lib/lead-scoring.ts. Diaria a las 06:00 UTC
 * (decisión de producto: recálculo bidireccional, scoring = fuente de verdad).
 */
export const recalculateLeadScoresTask: TaskConfig = {
  slug: 'recalculate-lead-scores' as TaskConfig['slug'],
  label: 'Scoring automático de leads',
  schedule: [{ cron: '0 6 * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'scored', type: 'number' },
    { name: 'updated', type: 'number' },
    { name: 'promoted', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    // Paginado completo: el primer page de 100 dejaría tenants sin scoring ni
    // hot-lead para siempre (hallazgo Devin PR #102).
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

    let totalScored = 0
    let totalUpdated = 0
    let totalPromoted = 0

    for (const tenant of tenants) {
      try {
        const res = await scoreTenantLeads({ payload: req.payload, tenantId: tenant.id })
        totalScored += res.scored
        totalUpdated += res.updated
        totalPromoted += res.promoted
      } catch (err) {
        // Un tenant con datos raros no bloquea el barrido del resto.
        req.payload.logger.error({
          msg: 'recalculate-lead-scores: error evaluando tenant',
          tenantId: tenant.id,
          tenant: tenant.name,
          err,
        })
      }
    }

    const summary = `Evaluados: ${totalScored} | Actualizados: ${totalUpdated} | Promocionados a caliente: ${totalPromoted}`
    req.payload.logger.info({ msg: 'recalculate-lead-scores completado', summary })

    return {
      output: {
        scored: totalScored,
        updated: totalUpdated,
        promoted: totalPromoted,
        summary,
      },
    }
  },
}
