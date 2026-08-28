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