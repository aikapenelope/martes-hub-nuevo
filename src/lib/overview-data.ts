import 'server-only'

import type { Payload, Where } from 'payload'
import { collectFollowupsToday, type FollowUpItem } from './followups-today'
import type {
  Conversation,
  ConversationSummary,
  EmailLog,
  Lead,
  Payment,
  User,
} from '@/payload-types'
import {
  monthlyPendingSeries,
  monthlyRevenueSeries,
  paymentsAggregate,
  quotesAggregate,
  startOfMonthIso,
  type MonthlyRevenuePoint,
  type PaymentAggregate,
  type QuoteAggregate,
} from './db-aggregates'
import { getIntegrationsHealth } from './integrations-health'
import type { Tenant } from '@/payload-types'
import type {
  ChannelSourceMetric,
  CockpitOperationalAlert,
  DayBucket,
  HourBucket,
  MonthlyCashflowPoint,
  TimeRangeKey,
  WorkspaceOverviewData,
  WorkspaceOverviewMetrics,
} from '@/components/workspace/overview/types'

export { paymentsAggregate, startOfMonthIso, type PaymentAggregate }

interface OverviewOptions {
  payload: Payload
  user: User
  tenant?: Tenant
  tenantId: number
  timeRange?: TimeRangeKey
}

const tenantWhere = (tenantId: number, extra?: Where): Where => ({
  and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
})

/** % de cambio entre dos totales, o `null` si no hay base de comparación. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/** Tasa de conversión real entre dos conteos de etapa, o `null` si la etapa previa está vacía. */
function stageRate(count: number, previousStageCount: number): number | null {
  if (previousStageCount <= 0) return null
  return (count / previousStageCount) * 100
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600_000).toISOString()
}

export const DEFAULT_TENANT_TIMEZONE = 'America/Caracas'

export interface TimeWindow {
  periodStartIso: string
  periodEndIso: string
  previousStartIso: string
  previousEndIso: string
}

/** Offset real (ms) entre la hora local de `timeZone` y UTC en el instante `ts`. */
function timeZoneOffsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ts))
  const map: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number.parseInt(p.value, 10)
  }
  const asUtc = Date.UTC(
    map.year ?? 1970,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    map.hour === 24 ? 0 : (map.hour ?? 0),
    map.minute ?? 0,
    map.second ?? 0,
  )
  return asUtc - ts
}

/** Convierte una hora local 'YYYY-MM-DDTHH:mm:ss' de `timeZone` al instante UTC equivalente. */
export function zonedTimeToUtc(localIso: string, timeZone: string): Date {
  const utcGuess = Date.parse(`${localIso}Z`)
  if (Number.isNaN(utcGuess)) return new Date(utcGuess)
  // Dos pasas para corregir el offset en bordes de DST (el offset válido depende del instante).
  let ts = utcGuess - timeZoneOffsetMs(utcGuess, timeZone)
  ts = utcGuess - timeZoneOffsetMs(ts, timeZone)
  return new Date(ts)
}

function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Lee la zona horaria configurada en Company Settings del tenant (default America/Caracas
 * si no hay config o el valor no es un IANA timezone válido). Usa el fetcher RLS del caller.
 */
export async function resolveTenantTimezone(
  fetchSettings: () => Promise<{ docs: unknown[] }>,
): Promise<string> {
  try {
    const res = await fetchSettings()
    const tz = (res.docs[0] as { timezone?: string } | undefined)?.timezone?.trim()
    return tz && isValidTimezone(tz) ? tz : DEFAULT_TENANT_TIMEZONE
  } catch {
    return DEFAULT_TENANT_TIMEZONE
  }
}

/**
 * Resuelve el rango ISO actual y el previo comparable según timeRange.
 * Las fechas calendario se calculan en la zona horaria del tenant (no la del servidor).
 */
export function resolveTimeRangeWindow(
  timeRange: TimeRangeKey,
  { now = new Date(), timeZone = DEFAULT_TENANT_TIMEZONE }: { now?: Date; timeZone?: string } = {},
): TimeWindow {
  const nowTime = now.getTime()
  const tz = isValidTimezone(timeZone) ? timeZone : DEFAULT_TENANT_TIMEZONE

  if (timeRange === 'hoy') {
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const todayStart = zonedTimeToUtc(`${localDate}T00:00:00`, tz)
    // El período previo cubre exactamente el mismo lapso transcurrido del día,
    // para no comparar un día parcial contra un día completo.
    const elapsed = Math.max(0, nowTime - todayStart.getTime())
    return {
      periodStartIso: todayStart.toISOString(),
      periodEndIso: now.toISOString(),
      previousStartIso: new Date(todayStart.getTime() - elapsed).toISOString(),
      previousEndIso: todayStart.toISOString(),
    }
  }

  // Ventanas rodantes de N días terminando ahora, con el período previo contiguo de igual duración.
  const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : timeRange === 'ano' ? 365 : 30
  const start = new Date(nowTime - days * 24 * 3600_000)
  const prevStart = new Date(nowTime - 2 * days * 24 * 3600_000)
  return {
    periodStartIso: start.toISOString(),
    periodEndIso: now.toISOString(),
    previousStartIso: prevStart.toISOString(),
    previousEndIso: start.toISOString(),
  }
}

/** 364 días (52 semanas × 7) de más antiguo a más reciente, en blanco para agregar conteos reales.
 * Aritmética de CALENDARIO local: (y, m, d) local de `now` y retroceso del campo día vía
 * Date.UTC — los componentes UTC del resultado SON la fecha calendario local (formatear el
 * instante con la zona del tenant correría cada clave un día en zonas UTC-negativas, y en
 * DST los días duran 23/25h). Las claves coinciden con el formateo Intl de los eventos. */
export function buildEmptyDayBuckets(timeZone: string, now: Date): DayBucket[] {
  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = todayParts.split('-').map(Number)
  return Array.from({ length: 364 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - i))
    const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    return { dateStr, count: 0 }
  })
}

const SOURCE_LABELS: Record<string, string> = {
  google_maps: 'Google Maps / Local',
  puerta_fria: 'Puerta Fría / Visita',
  whatsapp: 'WhatsApp Directo',
  instagram_dm: 'Instagram DM',
  tally: 'Formulario Web / Tally',
  apify: 'Apify Scraper',
  referido: 'Referidos',
  linkedin: 'LinkedIn',
  manual: 'Ingreso Manual',
}

export async function getWorkspaceOverviewData({
  payload,
  user,
  tenant,
  tenantId,
  timeRange = '30d',
}: OverviewOptions): Promise<WorkspaceOverviewData> {
  const q = <T extends Parameters<typeof payload.find>[0]>(opts: T) =>
    payload.find({ ...opts, overrideAccess: false, user } as T)
  const c = <T extends Parameters<typeof payload.count>[0]>(opts: T) =>
    payload.count({ ...opts, overrideAccess: false, user } as T)

  const now = new Date()
  const nowTime = now.getTime()
  const yearAgo = daysAgoIso(364)

  // La zona horaria del tenant define los límites calendario (p. ej. el inicio de 'hoy').
  const timeZone = await resolveTenantTimezone(() =>
    q({
      collection: 'company-settings',
      limit: 1,
      depth: 0,
      where: tenantWhere(tenantId),
    }),
  )
  const { periodStartIso, periodEndIso, previousStartIso, previousEndIso } = resolveTimeRangeWindow(
    timeRange,
    { now, timeZone },
  )

  const dateTitle = now
    .toLocaleDateString(
      'es-ES',
      {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone,
      },
    )
    .replace(/^\w/, (c) => c.toUpperCase())

  const [
    leadsNuevo,
    leadsContactado,
    leadsCalificado,
    leadsDescartado,
    clientsActive,
    recentPaymentsRes,
    recentConversationsRes,
    recentSummariesRes,
    recentEmailsRes,
    revenuePeriod,
    revenuePreviousPeriod,
    revenuePending,
    overdueTasks,
    overduePaymentsRes,
    activeQuotesCountRes,
    activeQuotesAggRes,
    allLeadsRes,
    hotLeadsRes,
    paidSeries,
    pendingSeries,
    followups,
    systemHealth,
    leadsCreatedPeriod,
    leadsCreatedPrev,
    conversionsPeriod,
    conversionsPrev,
  ] = await Promise.all([
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, { status: { equals: 'nuevo' } }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, { status: { equals: 'contactado' } }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, { status: { equals: 'calificado' } }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, { status: { equals: 'descartado' } }),
    }),
    c({
      collection: 'clients',
      where: tenantWhere(tenantId, { stage: { equals: 'activo' } }),
    }),
    q({
      collection: 'payments',
      limit: 5,
      sort: '-createdAt',
      depth: 1,
      where: tenantWhere(tenantId, { status: { equals: 'pagado' } }),
    }),
    q({
      collection: 'conversations',
      limit: 30,
      sort: '-updatedAt',
      depth: 1,
      where: tenantWhere(tenantId),
    }),
    q({
      collection: 'conversation-summaries',
      limit: 10,
      sort: '-createdAt',
      depth: 1,
      where: tenantWhere(tenantId),
    }),
    q({
      collection: 'email-log',
      limit: 5,
      sort: '-createdAt',
      depth: 0,
      where: tenantWhere(tenantId),
    }),
    paymentsAggregate(payload, tenantId, ['pagado'], periodStartIso, periodEndIso),
    paymentsAggregate(payload, tenantId, ['pagado'], previousStartIso, previousEndIso),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
    c({
      collection: 'tasks',
      where: tenantWhere(tenantId, {
        and: [
          { dueDate: { less_than: now.toISOString() } },
          { status: { not_in: ['completada', 'cancelada'] } },
        ],
      }),
    }),
    c({
      collection: 'payments',
      where: tenantWhere(tenantId, { status: { equals: 'vencido' } }),
    }),
    c({
      collection: 'quotes',
      where: tenantWhere(tenantId, {
        status: { in: ['draft', 'sent'] },
      }),
    }),
    quotesAggregate(payload, tenantId, ['draft', 'sent']),
    q({
      collection: 'leads',
      limit: 500,
      depth: 0,
      where: tenantWhere(tenantId),
    }),
    q({
      collection: 'leads',
      limit: 3,
      sort: '-updatedAt',
      depth: 0,
      where: tenantWhere(tenantId, { status: { in: ['calificado', 'contactado'] } }),
    }),
    monthlyRevenueSeries(payload, tenantId, 6),
    monthlyPendingSeries(payload, tenantId, 6),
    collectFollowupsToday({ payload, user, tenantId }),
    getIntegrationsHealth(payload, tenant, tenantId, user),
    // Deltas por ventana real: leads captados (createdAt) y conversiones
    // (convertedAt — instante persistido al convertir; las conversiones
    // históricas sin instante no cuentan, y la creación directa de clientes
    // sin lead no contamina la métrica)
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, {
        createdAt: { greater_than_equal: periodStartIso, less_than: periodEndIso },
      }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, {
        createdAt: { greater_than_equal: previousStartIso, less_than: previousEndIso },
      }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, {
        convertedAt: { greater_than_equal: periodStartIso, less_than: periodEndIso },
      }),
    }),
    c({
      collection: 'leads',
      where: tenantWhere(tenantId, {
        convertedAt: { greater_than_equal: previousStartIso, less_than: previousEndIso },
      }),
    }),
  ])

  const payments = recentPaymentsRes.docs as Payment[]
  const convList = recentConversationsRes.docs as Conversation[]
  const summaries = recentSummariesRes.docs as ConversationSummary[]
  const emails = recentEmailsRes.docs as EmailLog[]
  const hotLeads = hotLeadsRes.docs as Lead[]

  // Métricas agregadas
  const totalLeadsActive =
    leadsNuevo.totalDocs + leadsContactado.totalDocs + leadsCalificado.totalDocs
  const totalConvertedClients = clientsActive.totalDocs
  const totalHistoricLeads = totalLeadsActive + leadsDescartado.totalDocs + totalConvertedClients
  const globalConversionRate = stageRate(totalConvertedClients, totalHistoricLeads)

  // Pipeline ponderado
  const estimatedRevenueNew = leadsNuevo.totalDocs * 300
  const estimatedRevenueContacted = leadsContactado.totalDocs * 700
  const estimatedRevenueQualified = leadsCalificado.totalDocs * 1350
  const weightedPipelineTotal =
    estimatedRevenueNew * 0.2 +
    estimatedRevenueContacted * 0.45 +
    estimatedRevenueQualified * 0.75 +
    revenuePending.total
  const pipelineBase =
    estimatedRevenueNew +
    estimatedRevenueContacted +
    estimatedRevenueQualified +
    revenuePending.total
  const weightedProbabilityPct = pipelineBase > 0 ? (weightedPipelineTotal / pipelineBase) * 100 : 0

  // Tendencia período contra período previo
  const revenueTrendPct = pctChange(revenuePeriod.total, revenuePreviousPeriod.total)

  // Deltas por ventana real: captación (leads creados) y conversión (leads con
  // convertedAt en cada ventana — evento medible ligado al lead, no a la
  // creación de clientes, que puede ser directa o de leads antiguos)
  const leadsNuevosTrendPct = pctChange(leadsCreatedPeriod.totalDocs, leadsCreatedPrev.totalDocs)
  const conversionTrendPct = pctChange(conversionsPeriod.totalDocs, conversionsPrev.totalDocs)

  // Cotizaciones activas y Ticket promedio
  const quotesActiveCount = activeQuotesCountRes.totalDocs
  let quotesActiveTotal = activeQuotesAggRes.total
  if (quotesActiveTotal === 0 && quotesActiveCount > 0) {
    // Fallback completo para drivers sin pool SQL directo
    const fallbackQuotes = await q({
      collection: 'quotes',
      depth: 0,
      pagination: false,
      where: tenantWhere(tenantId, { status: { in: ['draft', 'sent'] } }),
    })
    quotesActiveTotal = (fallbackQuotes.docs as { total?: number | null }[]).reduce(
      (acc, q) => acc + (q.total || 0),
      0,
    )
  }
  const averageTicket = revenuePeriod.count > 0 ? Math.round(revenuePeriod.total / revenuePeriod.count) : 0

  // Salud 24h WhatsApp
  const critical24hCount = convList.filter((c) => {
    if (!c.lastInboundAt) return false
    const hoursSinceInbound = (nowTime - new Date(c.lastInboundAt).getTime()) / 3600_000
    return hoursSinceInbound > 20 && hoursSinceInbound <= 24
  }).length
  const openConvCount = convList.length
  const metaHealthPct = openConvCount > 0 ? Math.max(90, 100 - critical24hCount * 5) : 100

  // Tasas de conversión entre etapas
  const rateNewToContacted = stageRate(leadsContactado.totalDocs, leadsNuevo.totalDocs)
  const rateContactedToQualified = stageRate(leadsCalificado.totalDocs, leadsContactado.totalDocs)
  const rateQualifiedToWon = stageRate(totalConvertedClients, leadsCalificado.totalDocs)

  // Desglose de canales de origen (Google Maps, Puerta Fría, WhatsApp, etc.)
  const sourceCounts: Record<string, number> = {}
  const allLeads = allLeadsRes.docs as Lead[]
  for (const l of allLeads) {
    const s = l.source || 'manual'
    sourceCounts[s] = (sourceCounts[s] || 0) + 1
  }
  const totalLeadsCount = allLeads.length || 1
  const sourceBreakdown: ChannelSourceMetric[] = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      label: SOURCE_LABELS[source] || source,
      count,
      percentage: Math.round((count / totalLeadsCount) * 100),
    }))
    .sort((a, b) => b.count - a.count)

  // Generación de Alertas Operativas Proactivas
  const operationalAlerts: CockpitOperationalAlert[] = []

  if (critical24hCount > 0) {
    operationalAlerts.push({
      id: 'whatsapp-24h-sla',
      title: `${critical24hCount} conversación${critical24hCount > 1 ? 'es' : ''} de WhatsApp con ventana por expirar`,
      subtitle:
        'La ventana de atención de 24 horas de Meta está próxima a vencer (< 4h restantes). Responde ahora para evitar tarifas de plantilla.',
      severity: 'critical',
      href: '/workspace/inbox',
      actionText: 'Abrir Inbox',
      badge: 'Meta SLA',
    })
  }

  if (overduePaymentsRes.totalDocs > 0) {
    operationalAlerts.push({
      id: 'payments-overdue',
      title: `${overduePaymentsRes.totalDocs} cobro${overduePaymentsRes.totalDocs > 1 ? 's' : ''} vencido${overduePaymentsRes.totalDocs > 1 ? 's' : ''} pendiente${overduePaymentsRes.totalDocs > 1 ? 's' : ''}`,
      subtitle:
        'Hay cuentas por cobrar que han superado su fecha límite de pago acordada con el cliente.',
      severity: 'warning',
      href: '/workspace/billing',
      actionText: 'Ver Facturación',
      badge: 'Cobranza',
    })
  }

  if (overdueTasks.totalDocs > 0) {
    operationalAlerts.push({
      id: 'tasks-overdue',
      title: `${overdueTasks.totalDocs} tarea${overdueTasks.totalDocs > 1 ? 's' : ''} con fecha límite vencida`,
      subtitle: 'Tareas operativas atrasadas que requieren reprogramación o seguimiento inmediato.',
      severity: 'warning',
      href: '/workspace/tasks',
      actionText: 'Revisar Tareas',
      badge: 'Operación',
    })
  }

  // Flujo de caja real de 6 meses: cobrado (por paid_at) + pendiente (por due_date)
  const cashflowPoints: MonthlyCashflowPoint[] = paidSeries.map(
    (point: MonthlyRevenuePoint, i: number) => {
      const [year, month] = point.month.split('-').map(Number)
      const monthName = new Date(year, month - 1, 1)
        .toLocaleDateString('es-ES', { month: 'short' })
        .replace(/\./g, '')
        .toUpperCase()
      return {
        monthName,
        paid: point.total,
        pending: pendingSeries[i]?.total ?? 0,
      }
    },
  )

  // Matriz de actividad de 364 días — fechas calendario en la zona del tenant
  // (mismo criterio que resolveTimeRangeWindow; antes se agrupaba por fecha UTC).
  const dayBuckets = buildEmptyDayBuckets(timeZone, now)
  const bucketIndex = new Map(dayBuckets.map((b, i) => [b.dateStr, i]))

  /**
   * Conteos de interacción (activities + messages + payments pagados) por día
   * local y por (día de semana, hora) local, para los heatmaps del resumen.
   *
   * Ruta primaria: UNA agregación SQL tenant-scoped (patrón db-aggregates) con
   * UNION ALL de las tres fuentes — el GROUP BY lo hace Postgres con la zona
   * del tenant como parámetro, sin límite de filas y con payments por paid_at
   * (el instante que califica el registro, coherente con el filtro).
   *
   * Fallback (drivers sin pool SQL directo): paginación RLS hasta agotar
   * resultados de las tres fuentes — sin cap de 3.000, y derivando dow/hora
   * local con Intl del mismo instante que el día.
   */
  const fetchInteractionCounts = async (): Promise<{
    dayCounts: Map<string, number>
    hourCounts: Map<string, number>
  }> => {
    const dayCounts = new Map<string, number>()
    const hourCounts = new Map<string, number>()
    const db = payload.db as {
      pool?: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }
    }

    const add = (day: string, dow: number, hour: number) => {
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
      const key = `${dow}-${hour}`
      hourCounts.set(key, (hourCounts.get(key) ?? 0) + 1)
    }

    if (db.pool && typeof db.pool.query === 'function') {
      // ISO weekday de Postgres (1=lun…7=dom) → índice 0-6; hora local 0-23
      const res = await db.pool.query(
        `SELECT to_char(ts AT TIME ZONE $2, 'YYYY-MM-DD') AS day,
                ((EXTRACT(ISODOW FROM ts AT TIME ZONE $2) - 1))::int AS dow,
                EXTRACT(HOUR FROM ts AT TIME ZONE $2)::int AS hour
         FROM (
           SELECT created_at AS ts FROM activities WHERE tenant_id = $1 AND created_at >= $3
           UNION ALL
           SELECT created_at AS ts FROM messages WHERE tenant_id = $1 AND created_at >= $3
           UNION ALL
           SELECT paid_at AS ts FROM payments WHERE tenant_id = $1 AND status::text = 'pagado' AND paid_at >= $3
         ) events`,
        [tenantId, timeZone, yearAgo],
      )
      for (const row of res.rows) {
        add(String(row.day), Number(row.dow), Number(row.hour))
      }
      return { dayCounts, hourCounts }
    }

    // Fallback paginado con RLS — sin límite artificial, hasta agotar páginas
    const dayHourFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', hour: '2-digit' })
    const dayOnlyFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const PAGE = 500
    const sources: Array<{ collection: 'activities' | 'messages' | 'payments'; tsField: 'createdAt' | 'paidAt' }> = [
      { collection: 'activities', tsField: 'createdAt' },
      { collection: 'messages', tsField: 'createdAt' },
      { collection: 'payments', tsField: 'paidAt' },
    ]
    for (const { collection, tsField } of sources) {
      let page = 1
      while (true) {
        const res = await q({
          collection,
          limit: PAGE,
          page,
          depth: 0,
          select: { createdAt: tsField === 'createdAt', paidAt: tsField === 'paidAt' } as never,
          where: tenantWhere(
            tenantId,
            tsField === 'paidAt'
              ? { status: { equals: 'pagado' }, paidAt: { greater_than_equal: yearAgo } }
              : { createdAt: { greater_than_equal: yearAgo } },
          ),
        })
        for (const doc of res.docs as unknown as Array<Record<string, string | null>>) {
          const iso = doc[tsField === 'paidAt' ? 'paidAt' : 'createdAt'] ?? null
          if (!iso) continue
          const d = new Date(iso)
          const dayParts = dayHourFmt.format(d)
          const dow = DOW_ORDER.indexOf(dayParts.slice(0, 3))
          const hourRaw = Number.parseInt(dayParts.slice(-2), 10)
          if (dow < 0 || Number.isNaN(hourRaw)) continue
          const hour = hourRaw === 24 ? 0 : hourRaw
          add(dayOnlyFmt.format(d), dow, hour)
        }
        if (!res.hasNextPage || res.docs.length === 0) break
        page++
      }
    }
    return { dayCounts, hourCounts }
  }

  const { dayCounts: rawDay, hourCounts } = await fetchInteractionCounts()
  for (const [day, count] of rawDay) {
    const idx = bucketIndex.get(day)
    if (idx !== undefined) dayBuckets[idx].count += count
  }
  const totalYearInteractions = dayBuckets.reduce((acc, b) => acc + b.count, 0)

  // Matriz horaria 7×24 (168 celdas), de lunes a domingo
  const hourBuckets: HourBucket[] = Array.from({ length: 168 }, (_, i) => ({
    dow: Math.floor(i / 24),
    hour: i % 24,
    count: hourCounts.get(`${Math.floor(i / 24)}-${i % 24}`) ?? 0,
  }))

  const metrics: WorkspaceOverviewMetrics = {
    totalLeadsActive,
    totalConvertedClients,
    totalHistoricLeads,
    globalConversionRate,

    revenuePeriodTotal: revenuePeriod.total,
    revenuePeriodCount: revenuePeriod.count,
    revenuePreviousPeriodTotal: revenuePreviousPeriod.total,
    revenueMonthTotal: revenuePeriod.total,
    revenueMonthCount: revenuePeriod.count,
    revenueLastMonthTotal: revenuePreviousPeriod.total,
    revenueTrendPct,

    revenuePendingTotal: revenuePending.total,
    revenuePendingCount: revenuePending.count,
    overduePaymentsCount: overduePaymentsRes.totalDocs,

    averageTicket,
    quotesActiveCount,
    quotesActiveTotal,

    estimatedRevenueNew,
    estimatedRevenueContacted,
    estimatedRevenueQualified,
    weightedPipelineTotal,
    weightedProbabilityPct,

    overdueTasksCount: overdueTasks.totalDocs,

    critical24hCount,
    openConvCount,
    metaHealthPct,

    leadsNuevoCount: leadsNuevo.totalDocs,
    leadsContactadoCount: leadsContactado.totalDocs,
    leadsCalificadoCount: leadsCalificado.totalDocs,

    leadsCreatedInPeriod: leadsCreatedPeriod.totalDocs,
    conversionsInPeriod: conversionsPeriod.totalDocs,
    leadsNuevosTrendPct,
    conversionTrendPct,

    rateNewToContacted,
    rateContactedToQualified,
    rateQualifiedToWon,
  }

  return {
    metrics,
    hotLeads,
    dayBuckets,
    hourBuckets,
    totalYearInteractions,
    recentPayments: payments,
    recentConversations: convList,
    recentSummaries: summaries,
    recentEmails: emails,
    sourceBreakdown,
    operationalAlerts,
    cashflowPoints,
    followupsToday: followups as FollowUpItem[],
    systemHealth,
    timeRange,
    nowTime,
    dateTitle,
  }
}
