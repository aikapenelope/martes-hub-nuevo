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

/** Formateo consistente de tiempo transcurrido respecto a una marca de tiempo dada. */
export function formatTimeAgo(isoDate?: string | null, referenceTime: number = Date.now()): string {
  if (!isoDate) return 'reciente'
  const targetTime = new Date(isoDate).getTime()
  const diffMs = referenceTime > 0 ? referenceTime - targetTime : 0
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'hace un momento'
  if (diffMins < 60) return `hace ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `hace ${diffDays} d`
}

export type DealTemperature = 'hot' | 'warm' | 'cold'

export interface DealVelocity {
  temperature: DealTemperature
  hoursSinceLastActivity: number
  label: string
}

/**
 * Calcula la velocidad comercial y temperatura del trato:
 * - hot (< 24h): alta velocidad, fresco
 * - warm (24h - 72h): tibio, seguimiento requerido
 * - cold (> 72h): frío, en riesgo comercial
 */
export function computeDealVelocity(
  lastActiveIso: string | null | undefined,
  now: number = Date.now(),
): DealVelocity {
  if (!lastActiveIso) {
    return { temperature: 'cold', hoursSinceLastActivity: 999, label: 'Sin actividad' }
  }
  const activityTime = new Date(lastActiveIso).getTime()
  if (Number.isNaN(activityTime) || activityTime > now) {
    return { temperature: 'cold', hoursSinceLastActivity: 999, label: 'Sin actividad' }
  }
  const diffMs = Math.max(0, now - activityTime)
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  if (hours < 24) {
    return {
      temperature: 'hot',
      hoursSinceLastActivity: hours,
      label: hours < 1 ? 'Activo ahora' : `Activo hace ${hours}h`,
    }
  }
  if (hours <= 72) {
    const days = Math.floor(hours / 24)
    return {
      temperature: 'warm',
      hoursSinceLastActivity: hours,
      label: `Inactivo hace ${days}d`,
    }
  }
  const days = Math.floor(hours / 24)
  return {
    temperature: 'cold',
    hoursSinceLastActivity: hours,
    label: `En riesgo (${days}d sin tocar)`,
  }
}

/**
 * Resuelve la marca de tiempo más reciente entre varios eventos (mensajes, actividades, creación).
 */
export function resolveLastActiveTimestamp(...dates: (string | null | undefined)[]): string | null {
  let mostRecent: string | null = null
  let maxTime = -Infinity
  for (const date of dates) {
    if (!date) continue
    const time = new Date(date).getTime()
    if (!Number.isNaN(time) && time > maxTime) {
      maxTime = time
      mostRecent = date
    }
  }
  return mostRecent
}

/**
 * Resuelve la última interacción ocurrida en el pasado o presente (<= now)
 * a partir de una lista de eventos (ej. timeline de CRM), ignorando eventos
 * programados a futuro (como vencimientos de tareas o citas futuras) para
 * no clasificar erróneamente registros inactivos como frescos/calientes.
 */
export function resolvePastActivityTimestamp(
  timeline: { date: string }[],
  fallbackIso?: string | null,
  now: number = Date.now(),
): string | null {
  const pastEntry = timeline.find((e) => {
    const t = new Date(e.date).getTime()
    return !Number.isNaN(t) && t <= now
  })
  if (pastEntry) return pastEntry.date

  if (fallbackIso) {
    const fallbackTime = new Date(fallbackIso).getTime()
    if (!Number.isNaN(fallbackTime) && fallbackTime <= now) {
      return fallbackIso
    }
  }

  return null
}

