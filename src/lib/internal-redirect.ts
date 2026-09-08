/**
 * Solo acepta rutas internas de la app (hallazgo Devin #104 SEC-1): debe
 * empezar con una sola '/', sin backslashes ni esquemas (javascript:,
 * https:) — evita open redirects hacia sitios externos vía `redirectTo`.
 * Módulo puro: no puede vivir en un archivo 'use server' (sus exportaciones
 * deben ser funciones async).
 */
export function safeInternalRedirect(value: unknown, fallback = '/workspace/crm'): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw || raw.length > 500) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  if (raw.split(/[?#]/)[0]!.includes(':')) return fallback
  return raw
}
