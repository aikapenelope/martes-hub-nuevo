import type { PayloadRequest } from 'payload'

/**
 * Rate limiter de ventana fija, con backend distribuido opcional (Upstash
 * Redis REST) y fallback en memoria por-instancia. Dos modos:
 *
 *  - Por IP (`checkRateLimitDistributed`): protege webhooks públicos
 *    (OpenBSP, Tally, Resend). Configurable vía WEBHOOK_RATE_LIMIT_MAX /
 *    WEBHOOK_RATE_LIMIT_WINDOW_MS.
 *  - Por usuario (`checkUserActionRateLimit`): protege Server Actions
 *    autenticadas de costo variable (LLM, email, WhatsApp) invocadas desde
 *    el drawer del pipeline — la IP no es la clave correcta ahí porque
 *    varios agentes pueden compartir red y un solo usuario puede
 *    automatizar clics. Configurable vía ACTION_RATE_LIMIT_MAX /
 *    ACTION_RATE_LIMIT_WINDOW_MS.
 *
 * En serverless (Vercel) el fallback en memoria es por-instancia y NO
 * sustituye un WAF; es una primera barrera contra loops de reintentos y
 * flooding básico. Con Upstash configurado, el límite es real y compartido
 * entre instancias.
 */

interface Bucket {
  count: number
  resetAt: number
}

const webhookBuckets = new Map<string, Bucket>()
const actionBuckets = new Map<string, Bucket>()

const WEBHOOK_MAX = Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 120)
const WEBHOOK_WINDOW_MS = Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || 60_000)

const ACTION_MAX = Number(process.env.ACTION_RATE_LIMIT_MAX || 10)
const ACTION_WINDOW_MS = Number(process.env.ACTION_RATE_LIMIT_WINDOW_MS || 60_000)

export function clientKey(req: PayloadRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  return ip
}

function checkMemoryBucket(buckets: Map<string, Bucket>, key: string, max: number, windowMs: number): boolean {
  if (max <= 0) return true
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

/** Núcleo compartido: Upstash Redis si hay credenciales, si no memoria local. */
async function checkDistributed(
  key: string,
  max: number,
  windowMs: number,
  memoryBuckets: Map<string, Bucket>,
): Promise<boolean> {
  if (max <= 0) return true
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
          const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000))
          await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
            headers: { Authorization: `Bearer ${redisToken}` },
          })
        }
        return currentCount <= max
      }
    } catch {
      // Fallback a memoria en error de red
    }
  }

  return checkMemoryBucket(memoryBuckets, key, max, windowMs)
}

/**
 * Distributed rate limiter with Upstash Redis REST API support on Serverless / Vercel Edge,
 * with graceful in-memory fixed-window fallback when Redis credentials are not configured.
 */
export async function checkRateLimitDistributed(req: PayloadRequest, bucketName: string): Promise<boolean> {
  const key = `ratelimit:${bucketName}:${clientKey(req)}`
  return checkDistributed(key, WEBHOOK_MAX, WEBHOOK_WINDOW_MS, webhookBuckets)
}

export function checkRateLimit(req: PayloadRequest, bucketName: string): boolean {
  return checkMemoryBucket(webhookBuckets, `${bucketName}:${clientKey(req)}`, WEBHOOK_MAX, WEBHOOK_WINDOW_MS)
}

/**
 * Rate limit por usuario para Server Actions autenticadas de costo variable
 * (resumen de IA, envío de email, respuesta WhatsApp desde el drawer del
 * pipeline). `bucketName` distingue la acción para que agotar el límite de
 * una no bloquee las otras.
 */
export async function checkUserActionRateLimit(userId: number, bucketName: string): Promise<boolean> {
  const key = `ratelimit:action:${bucketName}:user:${userId}`
  return checkDistributed(key, ACTION_MAX, ACTION_WINDOW_MS, actionBuckets)
}
