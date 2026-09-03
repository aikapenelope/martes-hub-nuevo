import 'server-only'

import type { Payload, Where } from 'payload'
import { collectFollowupsToday, type FollowUpItem } from './followups-today'
import type {
  Activity,
  Conversation,
  ConversationSummary,
  EmailLog,
  Lead,
  Message,
  Payment,
  User,
} from '@/payload-types'
import {
  monthlyPendingSeries,
  monthlyRevenueSeries,
  paymentsAggregate,
  startOfMonthIso,
  type MonthlyRevenuePoint,
  type PaymentAggregate,
} from './db-aggregates'
import { getIntegrationsHealth } from './integrations-health'
import type { Tenant } from '@/payload-types'
import type {
  ChannelSourceMetric,
  CockpitOperationalAlert,
  DayBucket,
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

/** 364 días (52 semanas × 7) de más antiguo a más reciente, en blanco para agregar conteos reales. */
function buildEmptyDayBuckets(): DayBucket[] {
  return Array.from({ length: 364 }, (_, i) => ({
    dateStr: new Date(Date.now() - (363 - i) * 24 * 3600_000).toISOString().slice(0, 10),
    count: 0,
  }))
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
    allLeadsRes,
    yearActivities,
    yearMessages,
    yearPaidPayments,
    hotLeadsRes,
    paidSeries,
    pendingSeries,
    followups,
    systemHealth,
  ] = await Promise.all([
    q({
      collection: 'leads',
      limit: 0,
      where: tenantWhere(tenantId, { status: { equals: 'nuevo' } }),
    }),
    q({
      collection: 'leads',
      limit: 0,
      where: tenantWhere(tenantId, { status: { equals: 'contactado' } }),
    }),
    q({
      collection: 'leads',
      limit: 0,
      where: tenantWhere(tenantId, { status: { equals: 'calificado' } }),
    }),
    q({
      collection: 'leads',
      limit: 0,
      where: tenantWhere(tenantId, { status: { equals: 'descartado' } }),
    }),
    q({
      collection: 'clients',
      limit: 0,
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
      limit: 5,
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
    q({
      collection: 'tasks',
      limit: 0,
      where: tenantWhere(tenantId, {
        and: [
          { dueDate: { less_than: now.toISOString() } },
          { status: { not_in: ['completada', 'cancelada'] } },
        ],
      }),
    }),
    q({
      collection: 'payments',
      limit: 0,
      where: tenantWhere(tenantId, { status: { equals: 'vencido' } }),
    }),
    q({
      collection: 'leads',
      limit: 500,
      depth: 0,
      where: tenantWhere(tenantId),
    }),
    q({
      collection: 'activities',
      limit: 3000,
      depth: 0,
      where: tenantWhere(tenantId, { createdAt: { greater_than_equal: yearAgo } }),
    }),
    q({
      collection: 'messages',
      limit: 3000,
      depth: 0,
      where: tenantWhere(tenantId, { createdAt: { greater_than_equal: yearAgo } }),
    }),
    q({
      collection: 'payments',
      limit: 3000,
      depth: 0,
      where: tenantWhere(tenantId, {
        status: { equals: 'pagado' },
        paidAt: { greater_than_equal: yearAgo },
      }),
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

  // Matriz de actividad de 364 días
  const dayBuckets = buildEmptyDayBuckets()
  const bucketIndex = new Map(dayBuckets.map((b, i) => [b.dateStr, i]))
  const addToBucket = (isoDate?: string | null) => {
    if (!isoDate) return
    const idx = bucketIndex.get(isoDate.slice(0, 10))
    if (idx !== undefined) dayBuckets[idx].count++
  }
  for (const a of yearActivities.docs as Activity[]) addToBucket(a.createdAt)
  for (const m of yearMessages.docs as Message[]) addToBucket(m.createdAt)
  for (const p of yearPaidPayments.docs as Payment[]) addToBucket(p.createdAt)
  const totalYearInteractions = dayBuckets.reduce((acc, b) => acc + b.count, 0)

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

    rateNewToContacted,
    rateContactedToQualified,
    rateQualifiedToWon,
  }

  return {
    metrics,
    hotLeads,
    dayBuckets,
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
