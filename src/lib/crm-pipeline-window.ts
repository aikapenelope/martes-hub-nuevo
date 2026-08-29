/**
 * Cálculos puros de la ventana de 24h de Meta y tiempos relativos para el
 * Pipeline Kanban. Sin `import 'server-only'` a propósito: no tocan
 * Payload ni la base de datos, así que también se importan directamente
 * desde `tests/int/crm-pipeline.int.spec.ts` sin necesitar Postgres.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000

export interface WindowState {
  /** Minutos restantes de la ventana de 24h; null = sin conversación aún, <=0 = expirada. */
  windowMinutesRemaining: number | null
  /** Proxy determinista: el último evento de la conversación fue entrante (nadie respondió después). */
  needsReply: boolean
  minutesSinceLastInbound: number | null
}

/** Deriva el estado de la ventana de 24h de Meta a partir de timestamps ya resueltos. */
export function computeWindowState(
  lastInboundAt: string | null,
  lastMessageAt: string | null,
  now: number = Date.now(),
): WindowState {
  const windowMinutesRemaining = lastInboundAt
    ? Math.round((WINDOW_MS - (now - new Date(lastInboundAt).getTime())) / 60_000)
    : null
  const needsReply = Boolean(lastInboundAt) && lastInboundAt === lastMessageAt
  const minutesSinceLastInbound =
    needsReply && lastInboundAt ? Math.round((now - new Date(lastInboundAt).getTime()) / 60_000) : null
  return { windowMinutesRemaining, needsReply, minutesSinceLastInbound }
}

/** Etiqueta de tiempo relativo ("hace 10 min") para el snippet del último mensaje. */
export function relativeLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Sin mensajes'
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'justo ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}
