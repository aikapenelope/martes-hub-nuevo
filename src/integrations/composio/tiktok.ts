import type { Composio } from '@composio/core'

import { executeTool } from './client'
import { parseToolData } from '../../lib/social-publish'

/**
 * Adapter TikTok vía Composio (fase 4 — doc ideas-futuras/06).
 *
 * TikTok NO tiene managed OAuth: requiere la app propia registrada
 * (TIKTOK_CLIENT_ID/SECRET) montada como auth config custom — ver
 * `getOrCreateManagedAuthConfig` en client.ts. La misma app sirve para todos
 * los tenants (el redirect es el callback de Composio).
 *
 * ⚠ Los args exactos de cada acción se validan con el spike
 * (`pnpm tsx scripts/spike-composio.ts tiktok --schema`): la regla de la skill
 * es no adivinar esquemas — este adapter pasa solo campos documentados por la
 * Content Posting API y el spike imprime el input schema real antes de usarlo
 * en producción.
 */

interface ComposioSession {
  composio: Composio
  userId: string
}

export interface TikTokVideoStats {
  id: string
  title: string | null
  permalink: string | null
  createdAt: string | null
  likeCount: number
  commentCount: number
  shareCount: number
  viewCount: number
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Normaliza un video crudo de LIST_VIDEOS/QUERY_VIDEOS a stats planas. */
export function normalizeTikTokVideo(raw: unknown): TikTokVideoStats | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = str(item.id) ?? str(item.video_id)
  if (!id) return null
  const stats = (item.stats ?? item.video_stats ?? {}) as Record<string, unknown>
  return {
    id,
    title: str(item.title) ?? str(item.video_description),
    permalink: str(item.share_url) ?? str(item.permalink) ?? str(item.video_url),
    createdAt: str(item.create_time) ?? str(item.created_at),
    likeCount: num(stats.like_count ?? item.like_count),
    commentCount: num(stats.comment_count ?? item.comment_count),
    shareCount: num(stats.share_count ?? item.share_count),
    viewCount: num(stats.view_count ?? item.view_count),
  }
}

/** Publica una FOTO (v1 de imagen; video llega con UPLOAD/PUBLISH_VIDEO). */
export async function postPhoto(
  composio: Composio,
  options: { userId: string; imageUrl: string; title: string },
): Promise<{ postId: string | null }> {
  const result = await executeTool<{ data?: string }>(composio, {
    toolkit: 'tiktok',
    slug: 'TIKTOK_POST_PHOTO',
    userId: options.userId,
    args: {
      photo_url: options.imageUrl,
      title: options.title,
      description: options.title,
    },
  })
  const parsed = parseToolData(result)
  return { postId: str(parsed.post_id ?? parsed.id ?? parsed.photo_id) }
}

/** Publica un video: upload → publish → estado (2 pasos como Instagram). */
export async function publishVideo(
  composio: Composio,
  options: { userId: string; videoUrl: string; title: string },
): Promise<{ publishId: string | null }> {
  const uploaded = await executeTool<{ data?: string }>(composio, {
    toolkit: 'tiktok',
    slug: 'TIKTOK_UPLOAD_VIDEO',
    userId: options.userId,
    args: { video_url: options.videoUrl },
  })
  const uploadedParsed = parseToolData(uploaded)
  const uploadId = str(uploadedParsed.publish_id ?? uploadedParsed.upload_id ?? uploadedParsed.id)
  if (!uploadId) throw new Error('TIKTOK_UPLOAD_VIDEO sin publish_id')

  const published = await executeTool<{ data?: string }>(composio, {
    toolkit: 'tiktok',
    slug: 'TIKTOK_PUBLISH_VIDEO',
    userId: options.userId,
    args: { publish_id: uploadId },
  })
  const parsed = parseToolData(published)
  return { publishId: str(parsed.publish_id ?? parsed.id) }
}

/** Stats de la cuenta (seguidores, likes, vistas). */
export async function getUserStats(
  composio: Composio,
  options: { userId: string },
): Promise<{ followers: number; likes: number; views: number }> {
  const result = await executeTool<{ data?: string }>(composio, {
    toolkit: 'tiktok',
    slug: 'TIKTOK_GET_USER_STATS',
    userId: options.userId,
    args: {},
  })
  const parsed = parseToolData(result)
  return {
    followers: num(parsed.follower_count ?? parsed.followers_count),
    likes: num(parsed.likes_count ?? parsed.total_likes),
    views: num(parsed.views_count ?? parsed.total_views),
  }
}

/** Lista videos recientes con sus stats (para post-metrics). */
export async function listVideos(
  composio: Composio,
  options: { userId: string; maxResults?: number },
): Promise<TikTokVideoStats[]> {
  const result = await executeTool<{ data?: string }>(composio, {
    toolkit: 'tiktok',
    slug: 'TIKTOK_LIST_VIDEOS',
    userId: options.userId,
    args: { max_results: options.maxResults ?? 50 },
  })
  const parsed = parseToolData(result)
  const list = (parsed.videos ?? parsed.data ?? parsed) as unknown
  const rawList = Array.isArray(list) ? list : []
  return rawList.map(normalizeTikTokVideo).filter((video): video is TikTokVideoStats => video !== null)
}
