/**
 * Token OAuth2 compartido por los integraciones de Google de SOLO LECTURA
 * (Gmail + Calendar). Sin dependencias: refresh contra oauth2.googleapis.com
 * y cache del access token en memoria de la lambda.
 *
 * Credenciales: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 * (un solo refresh token con los scopes readonly de gmail/calendar; Google
 * emite un access token por scope — el mismo refresh sirve para ambos, el
 * scope se resuelve al pedir el token y en cada llamada a la API).
 */

const TOKEN_API = 'https://oauth2.googleapis.com/token'

let cachedToken: { value: string; expiresAt: number } | null = null

export function areGoogleCredentialsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN,
  )
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const res = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? '',
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google OAuth refresh falló (${res.status}): ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('Google OAuth refresh sin access_token')

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}
