'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  RefreshCcw,
  SquareCheck,
  Zap,
} from 'lucide-react'
import type { Client, Tenant } from '@/payload-types'
import type { WorkspaceOverviewData } from './types'
import type { AgendaItem } from '@/lib/agenda-data'
import { OledCard } from '@/components/workspace/oled'
import { CockpitCommandStrip } from './CockpitCommandStrip'
import { CockpitAlertStrip } from './CockpitAlertStrip'
import { CockpitFollowupsToday } from './CockpitFollowupsToday'
import { CockpitOmnichannelFeed } from './CockpitOmnichannelFeed'
import { CockpitKpiGrid } from './CockpitKpiGrid'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { CockpitConversionFunnel } from './CockpitConversionFunnel'
import { CockpitCashflowChart } from './CockpitCashflowChart'
import { CockpitSourceBreakdown } from './CockpitSourceBreakdown'
import { CockpitPipelinePriorities } from './CockpitPipelinePriorities'

const agendaDateFmt = new Intl.DateTimeFormat('es-VE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Caracas',
})

const agendaTypeBadge: Record<AgendaItem['type'], { label: string; cls: string }> = {
  cita: { label: 'Cita GCal', cls: 'text-sky-400 border-sky-800/60 bg-sky-950/40' },
  task: { label: 'Tarea', cls: 'text-indigo-400 border-indigo-800/60 bg-indigo-950/40' },
  payment: { label: 'Cobro', cls: 'text-amber-400 border-amber-800/60 bg-amber-950/40' },
  membership: { label: 'Renovación', cls: 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40' },
}

interface CockpitFocusViewsProps {
  tenant: Tenant
  dateTitle: string
  canEdit: boolean
  clients: Client[]
  data: WorkspaceOverviewData
  agenda: AgendaItem[]
  initialView?: 'operativa' | 'ejecutiva'
}

export function CockpitFocusViews({
  tenant,
  dateTitle,
  canEdit,
  clients,
  data,
  agenda,
  initialView = 'operativa',
}: CockpitFocusViewsProps) {
  const [activeView, setActiveView] = useState<'operativa' | 'ejecutiva'>(initialView)

  const urgentCount = data.operationalAlerts.length + data.followupsToday.length

  const handleSelectView = (view: 'operativa' | 'ejecutiva') => {
    setActiveView(view)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('vista', view)
      window.history.replaceState(null, '', url.toString())
    }
  }

  // Atajos de teclado (1: Operativa, 2: Ejecutiva) cuando no se esté escribiendo en inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      if (isInput) return

      if (e.key === '1') {
        handleSelectView('operativa')
      } else if (e.key === '2') {
        handleSelectView('ejecutiva')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="space-y-4">
      {/* 1. Command Strip Superior */}
      <CockpitCommandStrip
        tenant={tenant}
        dateTitle={dateTitle}
        canEdit={canEdit}
        clients={clients}
      />

      {/* 2. Selector de Vistas de Enfoque (Tabs OLED) */}
      <nav
        aria-label="Vistas de enfoque del tablero"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-zinc-900/80 py-2.5 bg-black/40 px-1"
      >
        <div className="inline-flex items-center p-1 bg-zinc-950 border border-zinc-800 gap-1">
          <button
            type="button"
            onClick={() => handleSelectView('operativa')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition ${
              activeView === 'operativa'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <Activity
              size={14}
              className={activeView === 'operativa' ? 'text-black' : 'text-sky-400'}
            />
            <span>Operativa · Hoy</span>
            {urgentCount > 0 ? (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold border font-mono ${
                  activeView === 'operativa'
                    ? 'bg-amber-500 text-black border-amber-600'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {urgentCount}
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            )}
            <kbd className="hidden md:inline-block text-[9px] px-1 py-0.2 opacity-60 border border-current font-mono">
              1
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => handleSelectView('ejecutiva')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition ${
              activeView === 'ejecutiva'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <BarChart3
              size={14}
              className={activeView === 'ejecutiva' ? 'text-black' : 'text-indigo-400'}
            />
            <span>Ejecutiva · Rendimiento</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] font-bold border font-mono ${
                activeView === 'ejecutiva'
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              KPIs
            </span>
            <kbd className="hidden md:inline-block text-[9px] px-1 py-0.2 opacity-60 border border-current font-mono">
              2
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300">Telemetría activa</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400 text-[11px]">
            {activeView === 'operativa'
              ? 'Acción inmediata, agenda y seguimiento'
              : 'Salud comercial, conversión y finanzas'}
          </span>
        </div>
      </nav>

      {/* 3. Contenido según Vista de Enfoque */}
      {activeView === 'operativa' ? (
        <div className="space-y-4 animate-fadeIn">
          {/* Tira de Alertas Operativas */}
          <CockpitAlertStrip alerts={data.operationalAlerts} />

          {/* Seguimientos Proactivos de Hoy (SLA) */}
          <CockpitFollowupsToday items={data.followupsToday} />

          {/* Bento Operativo: Agenda 7 Días (izq) + Feed Omnicanal (der) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
            {/* Agenda próxima 7 días */}
            <section className="lg:col-span-7 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <span className="w-2 h-2 bg-sky-400 inline-block shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                  Agenda próxima · 7 días ({agenda.length})
                </h2>
                <Link
                  href="/workspace/calendar"
                  className="text-[11px] font-mono text-sky-400 hover:text-sky-300 transition flex items-center gap-1 font-bold"
                >
                  Ver calendario completo →
                </Link>
              </div>

              <OledCard className="!p-0">
                {agenda.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-zinc-500 space-y-1">
                    <Zap size={20} className="mx-auto text-zinc-600 mb-2" />
                    <p className="text-zinc-400 font-bold">Nada pendiente en la agenda esta semana.</p>
                    <p className="text-[11px] text-zinc-600">
                      Las reuniones agendadas en Google Calendar, cobros y tareas aparecerán aquí automáticamente.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-zinc-900/80">
                    {agenda.slice(0, 8).map((item, i) => {
                      const badge = agendaTypeBadge[item.type]
                      return (
                        <Link
                          key={`${item.type}-${i}-${item.date}`}
                          href={item.href}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition group"
                        >
                          <span className="text-zinc-500 group-hover:text-white transition shrink-0">
                            {item.type === 'cita' ? (
                              <CalendarClock size={16} className="text-sky-400" />
                            ) : item.type === 'task' ? (
                              <SquareCheck size={16} className="text-indigo-400" />
                            ) : item.type === 'payment' ? (
                              <CircleDollarSign size={16} className="text-amber-400" />
                            ) : (
                              <RefreshCcw size={16} className="text-emerald-400" />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="truncate text-sm text-white group-hover:text-sky-300 transition">
                                {item.label}
                              </strong>
                              <span
                                className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 shrink-0 ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-zinc-400 truncate block mt-0.5">
                              {item.sublabel}
                            </span>
                          </div>

                          <span className="shrink-0 text-[11px] font-mono text-zinc-400 text-right">
                            {agendaDateFmt.format(new Date(item.date))}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </OledCard>
            </section>

            {/* Feed Omnicanal en Vivo */}
            <section className="lg:col-span-5">
              <CockpitOmnichannelFeed
                conversations={data.recentConversations}
                summaries={data.recentSummaries}
                emails={data.recentEmails}
                payments={data.recentPayments}
                nowTime={data.nowTime}
              />
            </section>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fadeIn">
          {/* Tarjetas KPI de Rendimiento */}
          <CockpitKpiGrid
            metrics={data.metrics}
            revenueSeries={data.cashflowPoints.map((p) => p.paid)}
          />

          {/* Bento Superior: Flujo de Caja (7 cols) + Embudo de Conversión (5 cols) */}
          <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <CockpitCashflowChart points={data.cashflowPoints} />
            </div>
            <div className="lg:col-span-5">
              <CockpitConversionFunnel metrics={data.metrics} />
            </div>
          </section>

          {/* Bento Medio: Matriz Anual Heatmap (8 cols) + Canales de Captación (4 cols) */}
          <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <ActivityHeatmap
                daysData={data.dayBuckets}
                totalInteractions={data.totalYearInteractions}
              />
            </div>
            <div className="lg:col-span-4">
              <CockpitSourceBreakdown sources={data.sourceBreakdown} />
            </div>
          </section>

          {/* Bento Inferior: Radar de Prioridades Comerciales */}
          <section>
            <CockpitPipelinePriorities hotLeads={data.hotLeads} />
          </section>
        </div>
      )}
    </div>
  )
}
