import type { PayloadRequest } from 'payload'

/**
 * Rate limiter de ventana fija en memoria, por IP y por bucket.
 *
 * En serverless (Vercel) es por-instancia y NO sustituye un WAF / IP allowlist,
 * pero es una primera barrera contra loops de reintentos y flooding básico
 * hacia los endpoints de webhook públicos.
 *
 * Configurable vía env:
 *  - WEBHOOK_RATE_LIMIT_MAX   (default 120)
 *  - WEBHOOK_RATE_LIMIT_WINDOW_MS (default 60_000)
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const MAX = Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 120)
const WINDOW_MS = Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || 60_000)

export function clientKey(req: PayloadRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return ip
}

/**
 * Distributed rate limiter with Upstash Redis REST API support on Serverless / Vercel Edge,
 * with graceful in-memory fixed-window fallback when Redis credentials are not configured.
 */
export async function checkRateLimitDistributed(req: PayloadRequest, bucketName: string): Promise<boolean> {
  if (MAX <= 0) return true
  const key = `ratelimit:${bucketName}:${clientKey(req)}`
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

  if (redisUrl && redisToken) {
    try {
      const incrRes = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      })
      if (incrRes.ok) {
        const { result: currentCount } = (await incrRes.json()) as { result: number }
        if (currentCount === 1) {
          const ttlSeconds = Math.max(1, Math.ceil(WINDOW_MS / 1000))
          await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          })
        }
        return currentCount <= MAX
      }
    } catch {
      // Fallback to in-memory on network error
    }
  }

  return checkRateLimit(req, bucketName)
}

export function checkRateLimit(req: PayloadRequest, bucketName: string): boolean {
  if (MAX <= 0) return true
  const key = `${bucketName}:${clientKey(req)}`
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (bucket.count >= MAX) return false
  bucket.count += 1
  return true
}