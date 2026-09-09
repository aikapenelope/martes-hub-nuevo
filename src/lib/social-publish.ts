/**
 * Helpers puros del pipeline de publicación social (doc ideas-futuras/01 v3)
 * — sin `import 'server-only'` para que los tests los importen directo.
 */

/**
 * Las acciones de Composio devuelven `{ data: string, successful?: boolean }`
 * donde `data` es JSON en string. Parse defensivo: si no viene JSON válido,
 * devuelve {} — el llamador decide si es error.
 */
export function parseToolData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {}
  const data = (result as { data?: unknown }).data
  if (typeof data !== 'string') return (data as Record<string, unknown>) ?? {}
  try {
    const parsed: unknown = JSON.parse(data)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Extrae el id de usuario IG de la respuesta de INSTAGRAM_GET_USER_INFO. */
export function extractIgUserId(userInfoResult: unknown): string | null {
  const parsed = parseToolData(userInfoResult)
  const id = parsed.id ?? parsed.ig_user_id ?? parsed.user_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/** Extrae el creation_id de la respuesta del contenedor de media. */
export function extractCreationId(containerResult: unknown): string | null {
  const parsed = parseToolData(containerResult)
  const id = parsed.id ?? parsed.creation_id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/**
 * Valida el sobre de una acción Composio ANTES de interpretar su data:
 * `{ successful: false, error }` es un fallo del proveedor aunque venga con
 * data. Lanza con el error crudo del proveedor — el llamador decide cómo
 * persistirlo (BD completa, UI sanitizada).
 */
export function assertToolSuccess(result: unknown, label: string): void {
  if (!result || typeof result !== 'object') throw new Error(`Composio ${label}: respuesta vacía`)
  const envelope = result as { successful?: boolean; error?: unknown }
  if (envelope.successful === false) {
    const raw = typeof envelope.error === 'string' ? envelope.error : JSON.stringify(envelope.error ?? {})
    throw new Error(`Composio ${label} falló: ${raw.slice(0, 500)}`)
  }
}

/** Versión segura para UI: quita saltos y acota el mensaje (el crudo queda en BD/logs). */
export function sanitizeErrorForUi(message: string, max = 200): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** TTL de la media temporal de publicaciones sociales (48h). */
export const SOCIAL_MEDIA_TTL_MS = 48 * 60 * 60 * 1000

/**
 * ¿Corresponde purgar el original de esta media? Solo si el post ya está
 * publicado hace más del TTL y el original no fue purgado aún.
 */
export function isPurgeDue(options: {
  postStatus: string
  publishedAt: string | null
  purgedAt: string | null
  now: number
  ttlMs?: number
}): boolean {
  const ttl = options.ttlMs ?? SOCIAL_MEDIA_TTL_MS
  if (options.postStatus !== 'publicado') return false
  if (options.purgedAt) return false
  if (!options.publishedAt) return false
  const published = Date.parse(options.publishedAt)
  if (Number.isNaN(published)) return false
  return options.now - published >= ttl
}
