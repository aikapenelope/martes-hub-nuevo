import type { TaskConfig } from 'payload'

import { getComposioForTenant } from '../integrations/composio/client'
import { composioTenantUserId } from '../integrations/composio/shared'
import { getUserStats, listVideos } from '../integrations/composio/tiktok'

/**
 * Job diario `sync-tiktok-metrics` (fase 4 — doc ideas-futuras/06): por cada
 * conexión TikTok OK —
 *   1. GET_USER_STATS → fila diaria en `social-account-metrics`
 *   2. LIST_VIDEOS → upsert mínimo de `social-posts` + `post-metrics`
 *
 * Espejo compartido con Instagram: una sola tabla `post-metrics` (agnóstica de
 * plataforma vía `social-posts`), el ER% se calcula igual. Convención TikTok:
 * las vistas cuentan como impresiones Y alcance (proxy estándar de la
 * plataforma — no se inventan métricas que TikTok no da).
 */
export const syncTikTokMetricsTask: TaskConfig = {
  slug: 'sync-tiktok-metrics',
  label: 'Sync de métricas de TikTok (read-only)',
  schedule: [{ cron: '45 5 * * *', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'accounts', type: 'number' },
    { name: 'videos', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const connections = await req.payload.find({
      collection: 'tenant-connections',
      where: {
        and: [
          { toolkit: { equals: 'tiktok' } },
          { estado: { equals: 'ok' } },
          { scope: { equals: 'empresa' } },
        ],
      },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })

    if (connections.docs.length === 0) {
      return {
        output: {
          accounts: 0,
          videos: 0,
          summary: 'Sin conexiones TikTok activas — requiere la app propia registrada (fase 4)',
        },
      }
    }

    let accountsOk = 0
    let totalVideos = 0
    const errors: string[] = []

    for (const connection of connections.docs) {
      const tenantId =
        typeof connection.tenant === 'object' ? (connection.tenant?.id ?? null) : (connection.tenant ?? null)
      if (!tenantId) continue

      try {
        const session = await getComposioForTenant(req.payload, tenantId)
        if (!session) throw new Error('tenant sin API key de Composio')
        const userId = composioTenantUserId(tenantId)

        const accountRes = await req.payload.find({
          collection: 'social-accounts',
          where: {
            and: [
              { tenant: { equals: tenantId } },
              { composioConnectedAccountId: { equals: connection.connectedAccountId } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const socialAccountId = accountRes.docs[0]?.id ?? null
        if (!socialAccountId) throw new Error('no hay fila social-accounts para esta conexión')

        const todayIso = new Date().toISOString().slice(0, 10)
        const todayStart = `${todayIso}T00:00:00.000Z`

        // 1. Stats de cuenta → fila diaria.
        const stats = await getUserStats(session.composio, { userId })
        const existingAccountMetric = await req.payload.find({
          collection: 'social-account-metrics',
          where: {
            and: [
              { socialAccount: { equals: socialAccountId } },
              { recordedAt: { greater_than_equal: todayStart } },
              { recordedAt: { less_than_equal: `${todayIso}T23:59:59.999Z` } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const accountMetricData = {
          tenant: tenantId,
          socialAccount: socialAccountId,
          recordedAt: new Date().toISOString(),
          followerCount: stats.followers,
          profileViews: 0,
          websiteClicks: 0,
          reach: stats.views,
          rawMetrics: stats as unknown as Record<string, unknown>,
        }
        if (existingAccountMetric.docs[0]) {
          await req.payload.update({
            collection: 'social-account-metrics',
            id: existingAccountMetric.docs[0].id,
            data: accountMetricData,
            overrideAccess: true,
          })
        } else {
          await req.payload.create({
            collection: 'social-account-metrics',
            data: accountMetricData,
            overrideAccess: true,
          })
        }

        // 2. Videos → posts externos mínimos + post-metrics del día.
        const videos = await listVideos(session.composio, { userId, maxResults: 50 })
        for (const video of videos) {
          const existing = await req.payload.find({
            collection: 'social-posts',
            where: {
              and: [{ tenant: { equals: tenantId } }, { platformPostId: { equals: video.id } }],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          let postId: number
          const doc = existing.docs[0]
          if (doc) {
            postId = doc.id
          } else {
            const created = await req.payload.create({
              collection: 'social-posts',
              data: {
                tenant: tenantId,
                caption: video.title ?? '(video externo)',
                account: socialAccountId,
                status: 'publicado',
                platformPostId: video.id,
                permalink: video.permalink ?? undefined,
                publishedAt: video.createdAt ?? undefined,
              },
              overrideAccess: true,
            })
            postId = created.id
          }

          const existingMetric = await req.payload.find({
            collection: 'post-metrics',
            where: {
              and: [
                { post: { equals: postId } },
                { recordedDay: { equals: todayStart } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          const metricData = {
            tenant: tenantId,
            post: postId,
            recordedAt: new Date().toISOString(),
            recordedDay: todayStart,
            impressions: video.viewCount,
            reach: video.viewCount,
            likes: video.likeCount,
            comments: video.commentCount,
            shares: video.shareCount,
            saved: 0,
          }
          if (existingMetric.docs[0]) {
            await req.payload.update({
              collection: 'post-metrics',
              id: existingMetric.docs[0].id,
              data: metricData,
              overrideAccess: true,
            })
          } else {
            await req.payload.create({
              collection: 'post-metrics',
              data: metricData,
              overrideAccess: true,
            })
          }
          totalVideos += 1
        }

        await req.payload.update({
          collection: 'tenant-connections',
          id: connection.id,
          data: { lastSyncAt: new Date().toISOString() },
          overrideAccess: true,
        })
        accountsOk += 1
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error desconocido'
        errors.push(message.slice(0, 200))
        req.payload.logger.error({ msg: 'sync-tiktok-metrics: cuenta falló', tenantId, err })
        await req.payload
          .update({
            collection: 'tenant-connections',
            id: connection.id,
            data: { estado: 'error_api', ultimoError: message.slice(0, 500) },
            overrideAccess: true,
          })
          .catch(() => undefined)
      }
    }

    const summary = `Cuentas OK: ${accountsOk} · videos con métricas: ${totalVideos}${errors.length > 0 ? ` · errores: ${errors.join(' | ')}` : ''}`
    req.payload.logger.info({ msg: 'sync-tiktok-metrics completado', summary })
    return {
      output: { accounts: accountsOk, videos: totalVideos, summary },
    }
  },
}
