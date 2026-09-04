'use client'

import React, { useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  MailCheck,
  MessageCircle,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { Client, Conversation, ConversationSummary, EmailLog, Lead, Payment } from '@/payload-types'
import { formatTimeAgo } from '@/lib/crm-pipeline-window'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const SENTIMENT_BADGES: Record<string, { label: string; cls: string }> = {
  positivo: { label: 'Positivo', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  neutral: { label: 'Neutral', cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' },
  negativo: { label: 'Negativo', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  en_riesgo: { label: 'En Riesgo', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
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

  const aiSummaries = summaries.filter((s) => s.generatedBy === 'hermes_ai' || s.generatedBy === 'openbsp_agent')

  return (
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" /> Feed Omnicanal
          </h2>
          <p className="text-[11px] text-zinc-500">Eventos de WhatsApp, agentes IA, email y cobros</p>
        </div>

        {/* Selector de modo: Todos vs Agentes IA */}
        <div className="inline-flex p-0.5 bg-black border border-zinc-800 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2 py-0.5 transition ${
              filterMode === 'all'
                ? 'bg-zinc-800 text-white font-bold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ai')}
            className={`px-2 py-0.5 flex items-center gap-1 transition ${
              filterMode === 'ai'
                ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold'
                : 'text-zinc-500 hover:text-indigo-400'
            }`}
          >
            <Sparkles size={11} className="text-indigo-400" />
            <span>Agentes IA ({summaries.length})</span>
          </button>
        </div>
      </div>

      {filterMode === 'ai' ? (
        /* Vista dedicada a actividad de Agentes IA (Hermes / Jena / OpenBSP) */
        <div className="space-y-2 font-mono text-xs">
          {summaries.length === 0 ? (
            <div className="p-6 text-center text-zinc-500 font-mono text-xs space-y-1">
              <Bot size={20} className="mx-auto text-zinc-600 mb-1.5" />
              <p className="text-zinc-400 font-bold">Sin resúmenes de IA registrados aún.</p>
              <p className="text-[11px] text-zinc-600">
                Cuando los agentes sinteticen conversaciones o analicen leads, aparecerán aquí.
              </p>
            </div>
          ) : (
            summaries.slice(0, 5).map((s) => {
              const sentiment = SENTIMENT_BADGES[s.sentiment] || SENTIMENT_BADGES.neutral
              const agentName = AGENT_LABELS[s.generatedBy || 'hermes_ai'] || 'Agente IA'
              const relatedLeadId =
                typeof s.lead === 'object' && s.lead !== null ? (s.lead as Lead).id : typeof s.lead === 'number' ? s.lead : null
              const contactName =
                typeof s.client === 'object' && s.client !== null
                  ? (s.client as Client).name
                  : typeof s.lead === 'object' && s.lead !== null
                  ? (s.lead as Lead).fullName
                  : 'Contacto general'

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    if (relatedLeadId && onOpenLead) {
                      onOpenLead(relatedLeadId)
                    }
                  }}
                  className={`p-3 oled-subcard space-y-1.5 transition group ${
                    relatedLeadId && onOpenLead ? 'cursor-pointer hover:border-indigo-800/80' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-indigo-400 font-bold flex items-center gap-1 text-[11px]">
                        <Bot className="w-3.5 h-3.5" />
                        {agentName}
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-300 font-bold truncate max-w-[140px] sm:max-w-[200px]">
                        {contactName}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">{formatTimeAgo(s.createdAt, nowTime)}</span>
                  </div>

                  <p className="text-zinc-200 text-xs line-clamp-2 leading-relaxed">{s.summary}</p>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-900/80 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`border px-1.5 py-0.2 uppercase font-bold text-[9px] ${sentiment.cls}`}>
                        {sentiment.label}
                      </span>
                      {s.nextSteps && (
                        <span className="text-zinc-400 truncate max-w-[160px] hidden sm:inline">
                          ➔ {s.nextSteps}
                        </span>
                      )}
                    </div>
                    {relatedLeadId && onOpenLead && (
                      <span className="text-indigo-400 group-hover:text-indigo-300 flex items-center gap-0.5 font-bold">
                        Ver ficha <ChevronRight size={12} />
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        /* Vista unificada (Todos los eventos) */
        <div className="space-y-2.5 font-mono text-xs">
          {latestConv && (
            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sky-400 font-bold flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp / Instagram
                </span>
                <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestConv.updatedAt, nowTime)}</span>
              </div>
              <p className="text-zinc-200 text-xs truncate">Interacción activa con {latestConv.contactAddress}</p>
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                <span>Canal: {latestConv.channel}</span>
              </div>
            </div>
          )}

          {latestSummary && (
            <div
              className={`p-3 oled-subcard space-y-1.5 ${
                typeof latestSummary.lead === 'object' && latestSummary.lead !== null && onOpenLead
                  ? 'cursor-pointer hover:border-indigo-800/80'
                  : ''
              }`}
              onClick={() => {
                if (typeof latestSummary.lead === 'object' && latestSummary.lead !== null && onOpenLead) {
                  onOpenLead((latestSummary.lead as Lead).id)
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Resumen IA ({AGENT_LABELS[latestSummary.generatedBy || 'hermes_ai'] || 'IA'})
                </span>
                <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestSummary.createdAt, nowTime)}</span>
              </div>
              <p className="text-zinc-200 text-xs truncate">{latestSummary.summary}</p>
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                <span>Sentimiento: {latestSummary.sentiment}</span>
                {latestSummary.nextSteps && <span className="truncate max-w-[160px]">➔ {latestSummary.nextSteps}</span>}
              </div>
            </div>
          )}

          {latestEmail && (
            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                  <MailCheck className="w-3.5 h-3.5" /> Email (Resend)
                </span>
                <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestEmail.createdAt, nowTime)}</span>
              </div>
              <p className="text-zinc-200 text-xs truncate">{latestEmail.subject}</p>
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                <span>{latestEmail.to}</span>
              </div>
            </div>
          )}

          {latestPayment && (
            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pago Confirmado
                </span>
                <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestPayment.createdAt, nowTime)}</span>
              </div>
              <p className="text-zinc-200 text-xs truncate">
                {currency.format(Number(latestPayment.amount))} · {latestPayment.concept || 'Cobro'}
              </p>
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                <span>
                  Cliente:{' '}
                  {typeof latestPayment.client === 'object' && latestPayment.client !== null
                    ? (latestPayment.client as Client).name
                    : 'Sin cliente vinculado'}
                </span>
              </div>
            </div>
          )}

          {!latestConv && !latestSummary && !latestEmail && !latestPayment && (
            <div className="p-6 text-center text-zinc-500 font-mono text-xs">
              Sin actividad reciente registrada todavía.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

