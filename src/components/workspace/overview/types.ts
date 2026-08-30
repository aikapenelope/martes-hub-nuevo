import type { Conversation, ConversationSummary, EmailLog, Lead, Payment } from '@/payload-types'

export interface DayBucket {
  dateStr: string
  count: number
}

export interface WorkspaceOverviewMetrics {
  totalLeadsActive: number
  totalConvertedClients: number
  totalHistoricLeads: number
  globalConversionRate: number | null

  revenueMonthTotal: number
  revenueMonthCount: number
  revenueLastMonthTotal: number
  revenueTrendPct: number | null

  revenuePendingTotal: number
  revenuePendingCount: number

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
  nowTime: number
  dateTitle: string
}
