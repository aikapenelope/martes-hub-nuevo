'use server'

import { getWorkspaceContext } from '@/lib/workspace-context'

export interface ExchangeRateInfo {
  rate: number
  source: 'bcv' | 'binance' | 'manual'
  label: string
  updatedAt: string
}

export interface LiveExchangeRates {
  bcv: ExchangeRateInfo
  binance: ExchangeRateInfo
  updatedAt: string
}

// Caché en memoria por 3 minutos para evitar saturación de APIs externas
let cachedRates: LiveExchangeRates | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 3 * 60 * 1000
const MIN_FORCE_INTERVAL_MS = 10 * 1000
let lastForceRefreshTimestamp = 0

// Tasas base de resguardo ante fallos de conectividad
const FALLBACK_BCV_RATE = 807.38
const FALLBACK_BINANCE_RATE = 945.0

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 4000,
  forceRefresh = false,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
      ...(forceRefresh ? { cache: 'no-store' as const } : { next: { revalidate: 180 } }),
    })
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Consulta la tasa oficial del BCV desde dolarapi.com
 */
async function fetchBcvRate(forceRefresh = false): Promise<ExchangeRateInfo> {
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial', undefined, 4000, forceRefresh)
    if (res.ok) {
      const data = (await res.json()) as { promedio?: number; fechaActualizacion?: string }
      if (typeof data.promedio === 'number' && data.promedio > 0) {
        return {
          rate: Math.round(data.promedio * 100) / 100,
          source: 'bcv',
          label: 'BCV Oficial',
          updatedAt: data.fechaActualizacion || new Date().toISOString(),
        }
      }
    }
  } catch (err) {
    console.warn('[exchange-rates] Falló consulta BCV API, usando fallback:', err)
  }

  return {
    rate: FALLBACK_BCV_RATE,
    source: 'bcv',
    label: 'BCV Oficial (Estimado)',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Consulta la tasa Binance P2P / Paralelo desde Binance P2P o dolarapi.com
 */
async function fetchBinanceRate(forceRefresh = false): Promise<ExchangeRateInfo> {
  // 1. Intentar directo de Binance P2P C2C API
  try {
    const res = await fetchWithTimeout(
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VES',
          merchantCheck: false,
          page: 1,
          payTypes: ['PagoMovil'],
          rows: 5,
          tradeType: 'BUY',
        }),
      },
      4000,
      forceRefresh,
    )

    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ adv?: { price?: string } }>
      }
      const prices = data.data
        ?.map((d) => Number(d.adv?.price))
        .filter((p): p is number => typeof p === 'number' && !Number.isNaN(p) && p > 0)

      if (prices && prices.length > 0) {
        // Promedio de los primeros anuncios verificados de Binance P2P
        const avg = prices.reduce((acc, p) => acc + p, 0) / prices.length
        return {
          rate: Math.round(avg * 100) / 100,
          source: 'binance',
          label: 'Binance P2P (USDT/VES)',
          updatedAt: new Date().toISOString(),
        }
      }
    }
  } catch {
    // Continuar a fallback paralelo
  }

  // 2. Fallback a dolarapi paralelo
  try {
    const res = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/paralelo', undefined, 4000, forceRefresh)
    if (res.ok) {
      const data = (await res.json()) as { promedio?: number; fechaActualizacion?: string }
      if (typeof data.promedio === 'number' && data.promedio > 0) {
        return {
          rate: Math.round(data.promedio * 100) / 100,
          source: 'binance',
          label: 'Binance / Paralelo',
          updatedAt: data.fechaActualizacion || new Date().toISOString(),
        }
      }
    }
  } catch (err) {
    console.warn('[exchange-rates] Falló consulta Binance/Paralelo API, usando fallback:', err)
  }

  return {
    rate: FALLBACK_BINANCE_RATE,
    source: 'binance',
    label: 'Binance P2P (Estimado)',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Retorna las tasas en vivo (BCV y Binance) con soporte de caché.
 */
export async function getLiveExchangeRates(forceRefresh = false): Promise<LiveExchangeRates> {
  const now = Date.now()
  if (!forceRefresh && cachedRates && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRates
  }

  // Rate-limit forced refreshes to avoid spamming external provider quotas
  const allowForce = forceRefresh && (now - lastForceRefreshTimestamp >= MIN_FORCE_INTERVAL_MS)
  if (forceRefresh && !allowForce && cachedRates) {
    return cachedRates
  }
  if (allowForce) {
    lastForceRefreshTimestamp = now
  }

  const [bcv, binance] = await Promise.all([
    fetchBcvRate(allowForce),
    fetchBinanceRate(allowForce),
  ])

  cachedRates = {
    bcv,
    binance,
    updatedAt: new Date().toISOString(),
  }
  cacheTimestamp = now

  return cachedRates
}

/**
 * Server Action para invocar desde el cliente en componentes de UI
 */
export async function getLiveExchangeRatesAction(forceRefresh = false): Promise<LiveExchangeRates> {
  await getWorkspaceContext()
  return getLiveExchangeRates(forceRefresh)
}
