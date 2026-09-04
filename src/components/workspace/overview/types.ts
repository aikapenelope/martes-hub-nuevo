import type { Conversation, ConversationSummary, EmailLog, Lead, Payment } from '@/payload-types'
import type { FollowUpItem } from '@/lib/followups-today'
import type { SystemHealthSummary } from '@/lib/integrations-health'

export type TimeRangeKey = 'hoy' | '7d' | '30d' | '90d' | 'ano'

export interface DayBucket {
  dateStr: string
  count: number
}

export interface ChannelSourceMetric {
  source: string
  label: string
  count: number
  percentage: number
}

export interface CockpitOperationalAlert {
  id: string
  title: string
  subtitle: string
  severity: 'critical' | 'warning' | 'info'
  href: string
  actionText: string
  badge?: string
}

export interface MonthlyCashflowPoint {
  monthName: string
  paid: number
  pending: number
}

export interface WorkspaceOverviewMetrics {
  totalLeadsActive: number
  totalConvertedClients: number
  totalHistoricLeads: number
  globalConversionRate: number | null

  revenuePeriodTotal: number
  revenuePeriodCount: number
  revenuePreviousPeriodTotal: number
  /** Alias retrocompatible para el mes actual cuando timeRange es 30d */
  revenueMonthTotal: number
  revenueMonthCount: number
  revenueLastMonthTotal: number
  revenueTrendPct: number | null

  revenuePendingTotal: number
  revenuePendingCount: number
  overduePaymentsCount: number

  /** Ticket promedio en el período seleccionado */
  averageTicket: number
  /** Cotizaciones activas en negociación (draft + sent) */
  quotesActiveCount: number
  quotesActiveTotal: number

  estimatedRevenueNew: number
  estimatedRevenueContacted: number
  estimatedRevenueQualified: number
  weightedPipelineTotal: number
  weightedProbabilityPct: number

  overdueTasksCount: number

  critical24hCount: number
  openConvCount: number
  metaHealthPct: number

  leadsNuevoCount: number
  leadsContactadoCount: number
  leadsCalificadoCount: number

  rateNewToContacted: number | null
  rateContactedToQualified: number | null
  rateQualifiedToWon: number | null
}

export interface WorkspaceOverviewData {
  metrics: WorkspaceOverviewMetrics
  hotLeads: Lead[]
  dayBuckets: DayBucket[]
  totalYearInteractions: number
  recentPayments: Payment[]
  recentConversations: Conversation[]
  recentSummaries: ConversationSummary[]
  recentEmails: EmailLog[]
  sourceBreakdown: ChannelSourceMetric[]
  operationalAlerts: CockpitOperationalAlert[]
  cashflowPoints: MonthlyCashflowPoint[]
  followupsToday: FollowUpItem[]
  systemHealth: SystemHealthSummary
  timeRange: TimeRangeKey
  nowTime: number
  dateTitle: string
}

