import type { TaskConfig } from 'payload'

// La publicación REAL requiere la integración con Meta Graph API
// (helper `publishToMeta(account, post)`). Hasta que exista, este job NO marca
// publicaciones como 'publicado' — eso evitaría que los usuarios crean que un
// post se publicó cuando en realidad nunca salió a producción.
const publishEnabled = process.env.META_GRAPH_API_ENABLED === 'true'

export const publishScheduledPostsTask: TaskConfig = {
  slug: 'publish-scheduled-posts',
  label: 'Publicar posts programados en redes sociales',
  schedule: [{ cron: '*/5 * * * *', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'published', type: 'number' },
    { name: 'failed', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!publishEnabled) {
      req.payload.logger.warn({
        msg: 'publish-scheduled-posts: META_GRAPH_API_ENABLED no está activado; posts se quedan en "programado"',
      })
      return {
        output: {
          published: 0,
          failed: 0,
          summary: 'Integración Meta Graph API desactivada; posts sin publicar',
        },
      }
    }

    const now = new Date().toISOString()

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    let totalFailed = 0

    for (const tenant of tenants.docs) {
      const pendingPosts = await req.payload.find({
        collection: 'social-posts',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'programado' } },
            { scheduledAt: { less_than_equal: now } },
          ],
        },
        depth: 2,
        limit: 20,
        overrideAccess: true,
        req,
      })

      for (const post of pendingPosts.docs) {
        const account = typeof post.account === 'object' && post.account !== null ? post.account : null

        if (!account || !account.accessToken || account.status !== 'conectada') {
          await req.payload.update({
            collection: 'social-posts',
            id: post.id,
            data: {
              status: 'fallido',
              lastError: 'Cuenta social no disponible o desconectada',
            },
            overrideAccess: true,
            req,
          })
          totalFailed++
          continue
        }

        try {
          // TODO(meta): sustituir por la llamada real a Meta Graph API
          // `const { id, permalink } = await publishToMeta(account, post)`
          throw new Error(
            'Publicación automática pendiente: integración con Meta Graph API no implementada',
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido de publicación'
          await req.payload.update({
            collection: 'social-posts',
            id: post.id,
            data: {
              status: 'fallido',
              lastError: message,
            },
            overrideAccess: true,
            req,
          })
          totalFailed++
        }
      }
    }

    const summary = `Publicados: 0 | Fallidos: ${totalFailed}`
    req.payload.logger.info({ msg: 'publish-scheduled-posts', summary })

    return {
      output: {
        published: 0,
        failed: totalFailed,
        summary,
      },
    }
  },
}
