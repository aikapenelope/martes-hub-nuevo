import type { TaskConfig } from 'payload'

import { runSocialPublish } from '../lib/social-publish-exec'

/**
 * Publica los posts `programado` cuya hora llegó (composer → Programar).
 * Cada publicación pasa por el MISMO pipeline que el botón "Publicar ya"
 * (`runSocialPublish`): reclamo atómico por estado → contenedor → publish →
 * publicado/fallido con el error crudo en `lastError`. Un post con error no
 * se reintenta solo (decisión de producto: reintento manual desde el hub).
 */
export const publishScheduledSocialPostsTask: TaskConfig = {
  slug: 'publish-scheduled-social-posts',
  label: 'Publicación de posts programados (social)',
  schedule: [{ cron: '*/15 * * * *', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'published', type: 'number' },
    { name: 'failed', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const due = await req.payload.find({
      collection: 'social-posts',
      where: {
        and: [
          { status: { equals: 'programado' } },
          { scheduledAt: { less_than_equal: new Date().toISOString() } },
          { scheduledAt: { exists: true } },
        ],
      },
      limit: 50,
      depth: 0,
      sort: 'scheduledAt',
      overrideAccess: true,
    })

    if (due.docs.length === 0) {
      return { output: { published: 0, failed: 0, summary: 'Sin posts programados vencidos' } }
    }

    let published = 0
    let failed = 0
    for (const post of due.docs) {
      const tenantId = typeof post.tenant === 'object' ? (post.tenant?.id ?? null) : (post.tenant ?? null)
      if (!tenantId) continue
      const result = await runSocialPublish(req.payload, { tenantId, postId: post.id })
      if (result.ok) published += 1
      else failed += 1
    }

    const summary = `Programados publicados: ${published} · fallidos: ${failed} de ${due.docs.length} vencidos`
    req.payload.logger.info({ msg: 'publish-scheduled-social-posts completado', summary })
    return { output: { published, failed, summary } }
  },
}
