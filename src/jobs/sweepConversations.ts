import type { TaskConfig } from 'payload'
import { getTenantAiConfig } from '../lib/ai-provider'

export const sweepConversationsTask: TaskConfig = {
  slug: 'sweep-unsummarized-conversations',
  label: 'Barrido periódico de conversaciones para resumen IA',
  schedule: [{ cron: '15 * * * *', queue: 'ai' }],
  inputSchema: [],
  outputSchema: [
    { name: 'queued', type: 'number' },
    { name: 'skipped', type: 'number' },
  ],
  handler: async ({ req }) => {
    // 1. Obtener todos los tenants
    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    let totalQueued = 0
    let totalSkipped = 0

    // Ventana de las últimas 24 horas
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    for (const tenant of tenants.docs) {
      const config = await getTenantAiConfig(req.payload, tenant.id)
      if (!config.autoSummarize) {
        continue
      }

      // Buscar conversaciones con actividad en las últimas 24h
      const activeConversations = await req.payload.find({
        collection: 'conversations',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { lastMessageAt: { greater_than: oneDayAgo } },
          ],
        },
        limit: 50,
        depth: 0,
        overrideAccess: true,
        req,
      })

      for (const conv of activeConversations.docs) {
        if (!conv.lastMessageAt) continue

        // Verificar si ya tiene un resumen posterior a su último mensaje
        const recentSummaries = await req.payload.find({
          collection: 'conversation-summaries',
          where: {
            and: [
              { tenant: { equals: tenant.id } },
              { conversation: { equals: conv.id } },
            ],
          },
          limit: 1,
          depth: 0,
          sort: '-createdAt',
          overrideAccess: true,
          req,
        })

        const lastSummary = recentSummaries.docs[0]
        if (lastSummary && new Date(lastSummary.createdAt) >= new Date(conv.lastMessageAt)) {
          totalSkipped++
          continue
        }

        // Encolar tarea de resumen
        try {
          await req.payload.jobs.queue({
            task: 'summarize-conversation',
            input: {
              conversationId: conv.id,
              tenantId: tenant.id,
              trigger: 'scheduled_sweep',
            },
            overrideAccess: true,
            req,
          })
          totalQueued++
        } catch (queueErr) {
          req.payload.logger.error({
            msg: 'sweep-unsummarized-conversations: error al encolar tarea',
            conversationId: conv.id,
            err: queueErr,
          })
        }
      }
    }

    req.payload.logger.info({
      msg: 'sweep-unsummarized-conversations completado',
      totalQueued,
      totalSkipped,
    })

    return { output: { queued: totalQueued, skipped: totalSkipped } }
  },
}
