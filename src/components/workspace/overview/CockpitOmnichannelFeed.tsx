'use client'

import React, { useState } from 'react'
import {
  Bot,
  ChevronRight,
  CreditCard,
  MailCheck,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import type { Client, Conversation, ConversationSummary, EmailLog, Lead, Payment } from '@/payload-types'
import { Badge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'
import { formatTimeAgo } from '@/lib/crm-pipeline-window'
import { cn } from '@/lib/utils'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const SENTIMENT_BADGES: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'warning' }> = {
  positivo: { label: 'Positivo', variant: 'success' },
  neutral: { label: 'Neutral', variant: 'outline' },
  negativo: { label: 'Negativo', variant: 'destructive' },
  en_riesgo: { label: 'En Riesgo', variant: 'warning' },
}

const AGENT_LABELS: Record<string, string> = {
  hermes_ai: 'Hermes AI',
  openbsp_agent: 'OpenBSP Agent',
  manual: 'Manual',
}

export function CockpitOmnichannelFeed({
  conversations,
  summaries,
  emails,
  payments,
  nowTime,
  onOpenLead,
}: {
  conversations: Conversation[]
  summaries: ConversationSummary[]
  emails: EmailLog[]
  payments: Payment[]
  nowTime: number
  onOpenLead?: (leadId: number) => void
}) {
  const [filterMode, setFilterMode] = useState<'all' | 'ai'>('all')

  const latestConv = conversations[0]
  const latestSummary = summaries[0]
  const latestEmail = emails[0]
  const latestPayment = payments[0]

  const aiSummaries = summaries.filter(
    (s) => s.generatedBy === 'hermes_ai' || s.generatedBy === 'openbsp_agent'
  )

  return (
    <DashboardCard className="gap-0">
      <CardHeader className="border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0 py-3.5 px-4 sm:px-6">
        <div>
          <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-sky-400 ring-4 ring-sky-400/20" />
            <span>Feed Omnicanal</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Eventos en tiempo real de WhatsApp, agentes IA, email y cobros
          </CardDescription>
        </div>

        {/* Selector de modo: Todos vs Agentes IA */}
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              filterMode === 'all'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ai')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              filterMode === 'ai'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="size-3 text-indigo-400" />
            <span>Agentes IA ({aiSummaries.length})</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filterMode === 'ai' ? (
          /* Vista dedicada a actividad de Agentes IA (Hermes / Jena / OpenBSP) */
          <div>
            {aiSummaries.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-1.5">
                <Bot className="size-6 mx-auto text-muted-foreground/60 mb-1" />
                <p className="font-medium text-foreground">Sin resúmenes de IA registrados aún.</p>
                <p className="text-xs text-muted-foreground">
                  Cuando los agentes sinteticen conversaciones o analicen leads, aparecerán aquí.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {aiSummaries.slice(0, 5).map((s) => {
                  const sentiment = SENTIMENT_BADGES[s.sentiment] || SENTIMENT_BADGES.neutral
                  const agentName = AGENT_LABELS[s.generatedBy || 'hermes_ai'] || 'Agente IA'
                  const relatedLeadId =
                    typeof s.lead === 'object' && s.lead !== null
                      ? (s.lead as Lead).id
                      : typeof s.lead === 'number'
                      ? s.lead
                      : null
                  const contactName =
                    typeof s.client === 'object' && s.client !== null
                      ? (s.client as Client).name
                      : typeof s.lead === 'object' && s.lead !== null
                      ? (s.lead as Lead).fullName
                      : 'Contacto general'

                  return (
                    <li
                      key={s.id}
                      onClick={() => {
                        if (relatedLeadId && onOpenLead) {
                          onOpenLead(relatedLeadId)
                        }
                      }}
                      className={cn(
                        'p-4 flex items-start gap-3 transition-colors hover:bg-muted/30 group',
                        relatedLeadId && onOpenLead ? 'cursor-pointer' : ''
                      )}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 mt-0.5">
                        <Bot className="size-4" />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                              {agentName}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-xs font-medium text-foreground truncate">
                              {contactName}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatTimeAgo(s.createdAt, nowTime)}
                          </span>
                        </div>

                        <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed">
                          {s.summary}
                        </p>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={sentiment.variant} className="text-[10px]">
                              {sentiment.label}
                            </Badge>
                            {s.nextSteps && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                                Pasos: {s.nextSteps}
                              </span>
                            )}
                          </div>

                          {relatedLeadId && onOpenLead && (
                            <span className="text-xs text-primary group-hover:underline flex items-center gap-0.5 font-medium">
                              Ver ficha <ChevronRight className="size-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          /* Vista unificada (Todos los eventos) */
          <div>
            {!latestConv && !latestSummary && !latestEmail && !latestPayment ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Sin actividad reciente registrada todavía.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {latestConv && (
                  <li className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-400 mt-0.5">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          WhatsApp / Mensajería
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(latestConv.updatedAt, nowTime)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Interacción activa con {latestConv.contactAddress}
                      </p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <Badge variant="outline" className="text-[10px]">
                          Canal: {latestConv.channel}
                        </Badge>
                      </div>
                    </div>
                  </li>
                )}

                {latestSummary && (
                  <li
                    className={cn(
                      'p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors group',
                      typeof latestSummary.lead === 'object' && latestSummary.lead !== null && onOpenLead
                        ? 'cursor-pointer'
                        : ''
                    )}
                    onClick={() => {
                      if (
                        typeof latestSummary.lead === 'object' &&
                        latestSummary.lead !== null &&
                        onOpenLead
                      ) {
                        onOpenLead((latestSummary.lead as Lead).id)
                      }
                    }}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 mt-0.5">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Resumen IA ({AGENT_LABELS[latestSummary.generatedBy || 'hermes_ai'] || 'IA'})
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(latestSummary.createdAt, nowTime)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 line-clamp-2">
                        {latestSummary.summary}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <Badge variant="outline" className="text-[10px]">
                          Sentimiento: {latestSummary.sentiment}
                        </Badge>
                        {latestSummary.nextSteps && (
                          <span className="text-xs text-muted-foreground truncate">
                            {latestSummary.nextSteps}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )}

                {latestEmail && (
                  <li className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 mt-0.5">
                      <MailCheck className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Email (Resend)
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(latestEmail.createdAt, nowTime)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 truncate">
                        {latestEmail.subject}
                      </p>
                      <p className="text-xs text-muted-foreground">{latestEmail.to}</p>
                    </div>
                  </li>
                )}

                {latestPayment && (
                  <li className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 mt-0.5">
                      <CreditCard className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Pago Confirmado
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(latestPayment.createdAt, nowTime)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {currency.format(Number(latestPayment.amount))}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          · {latestPayment.concept || 'Cobro'}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cliente:{' '}
                        {typeof latestPayment.client === 'object' && latestPayment.client !== null
                          ? (latestPayment.client as Client).name
                          : 'Sin cliente vinculado'}
                      </p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </DashboardCard>
  )
}

