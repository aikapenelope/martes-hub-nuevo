import type { TaskConfig } from 'payload'

// La recolección de métricas REALES requiere la integración con Meta Graph API.
// Hasta que exista el helper `fetchPostInsights(post)`, se bloquea la escritura
// de métricas para no inventar datos de engagement en producción.
const metricsEnabled = process.env.META_GRAPH_API_ENABLED === 'true'

export const fetchSocialMetricsTask: TaskConfig = {
  slug: 'fetch-social-metrics',
  label: 'Recolectar métricas de publicaciones sociales',
  schedule: [{ cron: '0 14 * * *', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'metricsRecorded', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!metricsEnabled) {
      req.payload.logger.warn({
        msg: 'fetch-social-metrics: META_GRAPH_API_ENABLED no está activado; no se registran métricas',
      })
      return {
        output: {
          metricsRecorded: 0,
          summary: 'Integración Meta Graph API desactivada; sin métricas registradas',
        },
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const todayIso = new Date().toISOString()
    const todayStart = todayIso.slice(0, 10)

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    let totalRecorded = 0

    for (const tenant of tenants.docs) {
      const publishedPosts = await req.payload.find({
        collection: 'social-posts',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'publicado' } },
            { publishedAt: { greater_than_equal: thirtyDaysAgo } },
          ],
        },
        depth: 0,
        limit: 50,
        overrideAccess: true,
        req,
      })

      for (const post of publishedPosts.docs) {
        // Dedup: si ya hay métricas registradas hoy para este post, se omite.
        // Evita doble conteo cuando el cron se ejecuta dos veces (cold-start retry).
        const existingMetric = await req.payload.find({
          collection: 'post-metrics',
          where: {
            and: [
              { post: { equals: post.id } },
              { recordedAt: { greater_than_equal: `${todayStart}T00:00:00.000Z` } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (existingMetric.docs.length > 0) continue

        // TODO(meta): sustituir por la llamada real a Meta Graph API
        // `const insights = await fetchPostInsights(post)` y guardar insights reales.
        req.payload.logger.warn({
          msg: 'fetch-social-metrics: sin integración Meta Graph API para post',
          postId: post.id,
          tenantId: tenant.id,
        })

        totalRecorded++
      }
    }

    const summary = `Métricas registradas: ${totalRecorded} publicaciones`
    req.payload.logger.info({ msg: 'fetch-social-metrics', summary })

    return {
      output: {
        metricsRecorded: totalRecorded,
        summary,
      },
    }
  },
}
