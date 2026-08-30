import type { Payload } from 'payload'
import type { PostMetric, SocialPost, User } from '@/payload-types'

export interface PostMetricSnapshot {
  impressions: number
  reach: number
  likes: number
  comments: number
  shares: number
  saved: number
  recordedAt: string
}

export interface SocialMetricsSummary {
  /** Última medición conocida por post (postId -> snapshot). */
  latestByPost: Map<number, PostMetricSnapshot>
  /** Totales agregados sobre la última medición de cada post con métricas. */
  totals: { impressions: number; reach: number; likes: number; comments: number }
  postsWithMetrics: number
}

/**
 * Resume las métricas reales de redes (post-metrics) — antes `/workspace/social`
 * solo mostraba estado de publicación (borrador/programado/publicado), nunca
 * el desempeño real. Los datos ya se guardan (un agente MCP conectado a
 * Metricool/Composio los escribe), solo no se leían en el workspace.
 */
export async function getSocialMetricsSummary(payload: Payload, user: User, tenantId: number): Promise<SocialMetricsSummary> {
  const result = await payload.find({
    collection: 'post-metrics',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    limit: 500,
    sort: '-recordedAt',
    overrideAccess: false,
    user,
  })

  const docs = result.docs as PostMetric[]
  const latestByPost = new Map<number, PostMetricSnapshot>()

  for (const m of docs) {
    const postId = typeof m.post === 'object' && m.post ? (m.post as SocialPost).id : (m.post as number)
    if (latestByPost.has(postId)) continue // ya tenemos una más reciente (docs viene ordenado -recordedAt)
    latestByPost.set(postId, {
      impressions: m.impressions ?? 0,
      reach: m.reach ?? 0,
      likes: m.likes ?? 0,
      comments: m.comments ?? 0,
      shares: m.shares ?? 0,
      saved: m.saved ?? 0,
      recordedAt: m.recordedAt,
    })
  }

  const totals = { impressions: 0, reach: 0, likes: 0, comments: 0 }
  for (const snap of latestByPost.values()) {
    totals.impressions += snap.impressions
    totals.reach += snap.reach
    totals.likes += snap.likes
    totals.comments += snap.comments
  }

  return { latestByPost, totals, postsWithMetrics: latestByPost.size }
}
