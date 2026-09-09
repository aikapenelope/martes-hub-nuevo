import type { TaskConfig } from 'payload'

import {
  executeTool,
  getComposioForTenant,
} from '../integrations/composio/client'
import {
  composioTenantUserId,
  composioUserUserId,
} from '../integrations/composio/shared'
import { extractIgUserId, parseToolData } from '../lib/social-publish'

/**
 * Job diario `sync-instagram-metrics` (doc 01 v3): por cada conexión Instagram
 * OK de `tenant-connections` —
 *   1. GET_IG_USER_INFO → ig_user_id (cacheado en la cuenta social)
 *   2. GET_IG_USER_MEDIA → upsert mínimo de `social-posts` externos (solo
 *      platformPostId/permalink/caption — sin imágenes)
 *   3. GET_IG_MEDIA_INSIGHTS por post → upsert idempotente en `post-metrics`
 *      (query-first por post+fecha del día)
 *   4. GET_USER_INSIGHTS → fila diaria en `social-account-metrics`
 *
 * Solo lectura y determinista (sin LLM). Los posts con `like_count` nulo en la
 * API (vistas/carousels) quedan con métricas 0 — no se inventan números.
 */

interface MediaItem {
  id: string
  caption?: string | null
  permalink?: string | null
  timestamp?: string | null
  likeCount?: number | null
  commentsCount?: number | null
}

function parseMediaItems(result: unknown): MediaItem[] {
  const parsed = parseToolData(result)
  const nested = (parsed as { data?: unknown }).data
  const items = Array.isArray(nested) ? nested : Array.isArray(parsed) ? (parsed as unknown[]) : []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : null
    if (!id) return []
    return [
      {
        id,
        caption: typeof record.caption === 'string' ? record.caption : null,
        permalink: typeof record.permalink === 'string' ? record.permalink : null,
        timestamp: typeof record.timestamp === 'string' ? record.timestamp : null,
        likeCount: typeof record.like_count === 'number' ? record.like_count : null,
        commentsCount: typeof record.comments_count === 'number' ? record.comments_count : null,
      },
    ]
  })
}

/** IG insights: `data` es array de { name, values: [{ value }] }. */
function insightValue(insightsResult: unknown, metric: string): number {
  const parsed = parseToolData(insightsResult)
  const list = (parsed as { data?: unknown }).data
  if (!Array.isArray(list)) return 0
  const found = list.find(
    (entry) => typeof entry === 'object' && entry !== null && (entry as { name?: string }).name === metric,
  ) as { values?: { value?: number }[] } | undefined
  const value = found?.values?.[0]?.value
  return typeof value === 'number' ? value : 0
}

export const syncInstagramMetricsTask: TaskConfig = {
  slug: 'sync-instagram-metrics',
  label: 'Sync de métricas de Instagram (read-only)',
  schedule: [{ cron: '30 5 * * *', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'accounts', type: 'number' },
    { name: 'posts', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const connections = await req.payload.find({
      collection: 'tenant-connections',
      where: { and: [{ toolkit: { equals: 'instagram' } }, { estado: { equals: 'ok' } }] },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })

    if (connections.docs.length === 0) {
      return {
        output: {
          accounts: 0,
          posts: 0,
          summary: 'Sin conexiones Instagram activas — conecta una cuenta en Ajustes → Conexiones',
        },
      }
    }

    let accountsOk = 0
    let totalPosts = 0
    const errors: string[] = []

    for (const connection of connections.docs) {
      const tenantId =
        typeof connection.tenant === 'object' ? (connection.tenant?.id ?? null) : (connection.tenant ?? null)
      if (!tenantId) continue
      const connectedAccountId = connection.connectedAccountId ?? null

      try {
        const session = await getComposioForTenant(req.payload, tenantId)
        if (!session) throw new Error('tenant sin API key de Composio')
        const userId =
          connection.scope === 'personal' && typeof connection.user === 'object' && connection.user?.id
            ? composioUserUserId(tenantId, connection.user.id)
            : composioTenantUserId(tenantId)

        // 1. IG user id (GET_USER_INFO no pide argumentos: resuelve 'me').
        const userInfo = await executeTool(session.composio, {
          toolkit: 'instagram',
          slug: 'INSTAGRAM_GET_USER_INFO',
          userId,
          args: {},
        })
        const igUserId = extractIgUserId(userInfo)
        if (!igUserId) throw new Error('GET_USER_INFO no devolvió ig_user_id')

        // Cuenta social espejo del tenant para esta conexión.
        const accountRes = await req.payload.find({
          collection: 'social-accounts',
          where: {
            and: [
              { tenant: { equals: tenantId } },
              { composioConnectedAccountId: { equals: connectedAccountId } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const socialAccountId = accountRes.docs[0]?.id ?? null
        if (!socialAccountId) throw new Error('no hay fila social-accounts para esta conexión')
        await req.payload.update({
          collection: 'social-accounts',
          id: socialAccountId,
          data: { externalUserId: igUserId, syncStatus: 'ok', lastSyncAt: new Date().toISOString() },
          overrideAccess: true,
        })

        // 2. Media de la cuenta → upsert de posts externos mínimos.
        const media = await executeTool(session.composio, {
          toolkit: 'instagram',
          slug: 'INSTAGRAM_GET_IG_USER_MEDIA',
          userId,
          args: {
            ig_user_id: igUserId,
            limit: 50,
            fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
          },
        })
        const items = parseMediaItems(media)
        const todayIso = new Date().toISOString().slice(0, 10)

        for (const item of items) {
          const existing = await req.payload.find({
            collection: 'social-posts',
            where: {
              and: [
                { tenant: { equals: tenantId } },
                { platformPostId: { equals: item.id } },
              ],
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
                caption: item.caption ?? '(post externo)',
                account: socialAccountId,
                status: 'publicado',
                platformPostId: item.id,
                permalink: item.permalink ?? undefined,
                publishedAt: item.timestamp ?? undefined,
              },
              overrideAccess: true,
            })
            postId = created.id
          }

          // 3. Insights del post → upsert de post-metrics por (post, hoy).
          const insights = await executeTool(session.composio, {
            toolkit: 'instagram',
            slug: 'INSTAGRAM_GET_IG_MEDIA_INSIGHTS',
            userId,
            args: { ig_media_id: item.id, metric: ['reach', 'saved', 'shares'] },
          })
          const reach = insightValue(insights, 'reach')
          const saved = insightValue(insights, 'saved')
          const shares = insightValue(insights, 'shares')

          const existingMetric = await req.payload.find({
            collection: 'post-metrics',
            where: {
              and: [
                { post: { equals: postId } },
                { recordedAt: { greater_than_equal: `${todayIso}T00:00:00.000Z` } },
                { recordedAt: { less_than_equal: `${todayIso}T23:59:59.999Z` } },
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
            impressions: reach,
            reach,
            likes: item.likeCount ?? 0,
            comments: item.commentsCount ?? 0,
            shares,
            saved,
            rawMetrics: insights as Record<string, unknown>,
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
          totalPosts += 1
        }

        // 4. Métricas de cuenta → fila diaria en social-account-metrics.
        const userInsights = await executeTool(session.composio, {
          toolkit: 'instagram',
          slug: 'INSTAGRAM_GET_USER_INSIGHTS',
          userId,
          args: {
            ig_user_id: igUserId,
            metric: ['follower_count', 'profile_views', 'website_clicks', 'reach'],
            period: 'day',
            metric_type: 'total_value',
          },
        })
        const existingAccountMetric = await req.payload.find({
          collection: 'social-account-metrics',
          where: {
            and: [
              { socialAccount: { equals: socialAccountId } },
              { recordedAt: { greater_than_equal: `${todayIso}T00:00:00.000Z` } },
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
          followerCount: insightValue(userInsights, 'follower_count'),
          profileViews: insightValue(userInsights, 'profile_views'),
          websiteClicks: insightValue(userInsights, 'website_clicks'),
          reach: insightValue(userInsights, 'reach'),
          rawMetrics: userInsights as Record<string, unknown>,
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
        req.payload.logger.error({ msg: 'sync-instagram-metrics: cuenta falló', tenantId, err })
        if (connectedAccountId) {
          await req.payload.update({
            collection: 'tenant-connections',
            id: connection.id,
            data: { estado: 'error_api', ultimoError: message.slice(0, 500) },
            overrideAccess: true,
          }).catch(() => undefined)
        }
      }
    }

    const summary = `Cuentas OK: ${accountsOk}/${connections.docs.length} · posts con métricas: ${totalPosts}${errors.length > 0 ? ` · errores: ${errors.join(' | ')}` : ''}`
    req.payload.logger.info({ msg: 'sync-instagram-metrics completado', summary })
    return {
      output: { accounts: accountsOk, posts: totalPosts, summary },
    }
  },
}
