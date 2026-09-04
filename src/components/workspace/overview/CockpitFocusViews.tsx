'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Eye,
  EyeOff,
  LayoutGrid,
  RefreshCcw,
  RotateCcw,
  SlidersHorizontal,
  SquareCheck,
  Zap,
} from 'lucide-react'
import type { Client, Segment, Tenant, User } from '@/payload-types'
import type { WorkspaceOverviewData } from './types'
import type { AgendaItem } from '@/lib/agenda-data'
import { OledCard } from '@/components/workspace/oled'
import { Drawer } from '@/components/workspace/overlays'
import { CrmLeadDrawer } from '@/components/workspace/CrmLeadDrawer'
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
import {
  CockpitIntegrationHealth,
} from './CockpitIntegrationHealth'
import {
  DEFAULT_EXECUTIVE_WIDGETS,
  DEFAULT_OPERATIVE_WIDGETS,
  EXECUTIVE_WIDGET_KEYS,
  OPERATIVE_WIDGET_KEYS,
  STORAGE_KEY_EXECUTIVE,
  STORAGE_KEY_OPERATIVE,
  useWidgetLayout,
  getWidgetSpanClass,
  type ExecutiveWidgetKey,
  type OperativeWidgetKey,
  type WidgetSpan,
} from './widget-layout'

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
  /** Opciones del drawer 360°: agentes asignables y rubros del tenant. */
  assignees?: User[]
  segments?: Segment[]
  initialView?: 'operativa' | 'ejecutiva'
}

export function CockpitFocusViews({
  tenant,
  dateTitle,
  canEdit,
  clients,
  data,
  agenda,
  assignees = [],
  segments = [],
  initialView = 'operativa',
}: CockpitFocusViewsProps) {
  const router = useRouter()
  const [activeView, setActiveView] = useState<'operativa' | 'ejecutiva'>(initialView)
  const [showConfig, setShowConfig] = useState(false)

  // Layout modular Bento persistido en LocalStorage.
  // El hook SIEMPRE arranca con los defaults y restaura lo guardado en un
  // efecto posterior a la hidratación (ver widget-layout.ts): leer
  // localStorage en el render inicial rompe la hidratación cuando hay
  // widgets ocultos.
  const [operativeWidgets, setOperativeWidgets] = useWidgetLayout(
    STORAGE_KEY_OPERATIVE,
    DEFAULT_OPERATIVE_WIDGETS,
    OPERATIVE_WIDGET_KEYS,
  )
  const [executiveWidgets, setExecutiveWidgets] = useWidgetLayout(
    STORAGE_KEY_EXECUTIVE,
    DEFAULT_EXECUTIVE_WIDGETS,
    EXECUTIVE_WIDGET_KEYS,
  )

  // Drawer 360° Polimórfico
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [selectedAgendaItem, setSelectedAgendaItem] = useState<AgendaItem | null>(null)

  // Guardar cambios en el layout (setWidgets persiste en localStorage)
  const toggleWidget = (key: string, isExecutive: boolean) => {
    if (isExecutive) {
      setExecutiveWidgets((prev) =>
        prev.map((w) => (w.key === key ? { ...w, visible: !w.visible } : w)),
      )
    } else {
      setOperativeWidgets((prev) =>
        prev.map((w) => (w.key === key ? { ...w, visible: !w.visible } : w)),
      )
    }
  }

  const updateWidgetSpan = (key: string, span: WidgetSpan, isExecutive: boolean) => {
    if (isExecutive) {
      setExecutiveWidgets((prev) =>
        prev.map((w) => (w.key === key ? { ...w, span } : w)),
      )
    } else {
      setOperativeWidgets((prev) =>
        prev.map((w) => (w.key === key ? { ...w, span } : w)),
      )
    }
  }

  const moveWidget = (key: string, direction: 'up' | 'down', isExecutive: boolean) => {
    if (isExecutive) {
      setExecutiveWidgets((prev) => {
        const index = prev.findIndex((w) => w.key === key)
        if (index === -1) return prev
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= prev.length) return prev
        const updated = [...prev]
        const current = updated[index]
        const target = updated[targetIndex]
        if (!current || !target) return prev
        updated[index] = target
        updated[targetIndex] = current
        return updated.map((item, idx) => ({ ...item, order: idx + 1 }))
      })
    } else {
      setOperativeWidgets((prev) => {
        const index = prev.findIndex((w) => w.key === key)
        if (index === -1) return prev
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= prev.length) return prev
        const updated = [...prev]
        const current = updated[index]
        const target = updated[targetIndex]
        if (!current || !target) return prev
        updated[index] = target
        updated[targetIndex] = current
        return updated.map((item, idx) => ({ ...item, order: idx + 1 }))
      })
    }
  }

  const resetWidgets = () => {
    setOperativeWidgets(DEFAULT_OPERATIVE_WIDGETS)
    setExecutiveWidgets(DEFAULT_EXECUTIVE_WIDGETS)
  }

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

  const renderOperativeWidget = (key: OperativeWidgetKey) => {
    switch (key) {
      case 'alerts':
        return <CockpitAlertStrip alerts={data.operationalAlerts} />
      case 'health':
        return <CockpitIntegrationHealth health={data.systemHealth} />
      case 'followups':
        return (
          <CockpitFollowupsToday
            items={data.followupsToday}
            onOpenLead={(id) => setSelectedLeadId(id)}
          />
        )
      case 'agenda':
        return (
          <section className="space-y-2">
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
                    const isLeadCita =
                      item.type === 'cita' &&
                      typeof item.leadId === 'number' &&
                      typeof item.clientId !== 'number'

                    return (
                      <div
                        key={`${item.type}-${i}-${item.date}`}
                        onClick={() => {
                          if (isLeadCita && item.leadId) {
                            setSelectedLeadId(item.leadId)
                          } else {
                            setSelectedAgendaItem(item)
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition group cursor-pointer"
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
                      </div>
                    )
                  })}
                </div>
              )}
            </OledCard>
          </section>
        )
      case 'feed':
        return (
          <CockpitOmnichannelFeed
            conversations={data.recentConversations}
            summaries={data.recentSummaries}
            emails={data.recentEmails}
            payments={data.recentPayments}
            nowTime={data.nowTime}
            onOpenLead={(id) => setSelectedLeadId(id)}
          />
        )
      default:
        return null
    }
  }

  const renderExecutiveWidget = (key: ExecutiveWidgetKey) => {
    switch (key) {
      case 'health':
        return <CockpitIntegrationHealth health={data.systemHealth} />
      case 'kpis':
        return (
          <CockpitKpiGrid
            metrics={data.metrics}
            revenueSeries={data.cashflowPoints.map((p) => p.paid)}
            timeRange={data.timeRange}
          />
        )
      case 'cashflow':
        return <CockpitCashflowChart points={data.cashflowPoints} />
      case 'funnel':
        return <CockpitConversionFunnel metrics={data.metrics} />
      case 'heatmap':
        return (
          <ActivityHeatmap
            daysData={data.dayBuckets}
            totalInteractions={data.totalYearInteractions}
          />
        )
      case 'sources':
        return <CockpitSourceBreakdown sources={data.sourceBreakdown} />
      case 'priorities':
        return (
          <CockpitPipelinePriorities
            hotLeads={data.hotLeads}
            onOpenLead={(id) => setSelectedLeadId(id)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Command Strip Superior con TimeRange y Quick Actions */}
      <CockpitCommandStrip
        tenant={tenant}
        dateTitle={dateTitle}
        canEdit={canEdit}
        clients={clients}
        timeRange={data.timeRange}
      />

      {/* 3. Selector de Vistas de Enfoque (Tabs OLED) & Bento Customizer */}
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

        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className={`px-2.5 py-1 border text-[11px] font-mono flex items-center gap-1.5 transition ${
              showConfig
                ? 'bg-sky-400 text-black border-sky-300 font-bold'
                : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
            }`}
            title="Personalizar bloques visibles del Bento"
          >
            <SlidersHorizontal size={13} />
            <span>Personalizar Bento</span>
          </button>

          <div className="hidden lg:flex items-center gap-2">
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
        </div>
      </nav>

      {/* Panel Desplegable: Personalización del Bento Modular y Elástico */}
      {showConfig && (
        <div className="p-4 oled-card border-sky-900/50 bg-sky-950/15 space-y-3 animate-fadeIn font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div className="flex items-center gap-2">
              <LayoutGrid size={15} className="text-sky-400" />
              <span className="font-bold text-white text-sm">
                Personalizar Bento ({activeView === 'operativa' ? 'Vista Operativa' : 'Vista Ejecutiva'})
              </span>
              <span className="hidden sm:inline text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 border border-zinc-800">
                Auto-flow elástico
              </span>
            </div>
            <button
              type="button"
              onClick={resetWidgets}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition self-start sm:self-auto px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800"
            >
              <RotateCcw size={12} /> Restaurar distribución original
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1">
            {(activeView === 'operativa' ? operativeWidgets : executiveWidgets).map((w, idx, arr) => {
              const isFirst = idx === 0
              const isLast = idx === arr.length - 1
              const isExec = activeView === 'ejecutiva'
              const currentSpan: WidgetSpan = w.span || 'normal'

              return (
                <div
                  key={w.key}
                  className={`p-2.5 border transition flex flex-col justify-between gap-2 ${
                    w.visible
                      ? 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700'
                      : 'bg-black/80 border-zinc-900/80 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleWidget(w.key, isExec)}
                      className="flex items-center gap-2 min-w-0 text-left hover:text-sky-300 transition"
                      title={w.visible ? 'Ocultar widget' : 'Mostrar widget'}
                    >
                      {w.visible ? (
                        <Eye size={13} className="text-emerald-400 shrink-0" />
                      ) : (
                        <EyeOff size={13} className="text-zinc-600 shrink-0" />
                      )}
                      <span
                        className={`text-xs truncate font-sans font-medium ${
                          w.visible ? 'text-zinc-200' : 'text-zinc-500 line-through'
                        }`}
                      >
                        {w.label}
                      </span>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => moveWidget(w.key, 'up', isExec)}
                        className="p-1 text-zinc-400 hover:text-white disabled:opacity-20 disabled:hover:text-zinc-400 hover:bg-zinc-800 rounded transition"
                        title="Subir posición"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => moveWidget(w.key, 'down', isExec)}
                        className="p-1 text-zinc-400 hover:text-white disabled:opacity-20 disabled:hover:text-zinc-400 hover:bg-zinc-800 rounded transition"
                        title="Bajar posición"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>

                  {w.visible && (
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-900 text-[10px]">
                      <span className="text-zinc-500 font-mono">Ancho:</span>
                      <div className="inline-flex items-center bg-zinc-900/90 border border-zinc-800 p-0.5 rounded gap-0.5">
                        {(
                          [
                            { id: 'compact' as const, label: '1/3' },
                            { id: 'normal' as const, label: '1/2' },
                            { id: 'wide' as const, label: '2/3' },
                            { id: 'full' as const, label: 'Full' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateWidgetSpan(w.key, opt.id, isExec)}
                            className={`px-1.5 py-0.5 font-mono transition ${
                              currentSpan === opt.id
                                ? 'bg-sky-400 text-black font-bold shadow-sm'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                            title={`Tamaño ${opt.label}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4. Contenido según Vista de Enfoque (Bento Modular Elástico) */}
      {activeView === 'operativa' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 [grid-auto-flow:dense] items-start animate-fadeIn">
          {operativeWidgets
            .filter((w) => w.visible)
            .map((w) => {
              const spanClass = getWidgetSpanClass(w.span, 'normal')
              const content = renderOperativeWidget(w.key)
              if (!content) return null
              return (
                <div key={w.key} className={`${spanClass} w-full transition-all duration-200`}>
                  {content}
                </div>
              )
            })}
          {operativeWidgets.every((w) => !w.visible) && (
            <div className="col-span-full p-8 text-center border border-dashed border-zinc-800 text-zinc-500 font-mono text-xs space-y-2">
              <p className="text-zinc-400 font-bold">No hay widgets visibles en la vista operativa.</p>
              <p>Abre «Personalizar Bento» arriba para activar los bloques que desees ver.</p>
              <button
                type="button"
                onClick={resetWidgets}
                className="mt-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-sky-400 border border-zinc-800 text-xs font-mono inline-flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> Restaurar distribución original
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 [grid-auto-flow:dense] items-start animate-fadeIn">
          {executiveWidgets
            .filter((w) => w.visible)
            .map((w) => {
              const spanClass = getWidgetSpanClass(w.span, 'normal')
              const content = renderExecutiveWidget(w.key)
              if (!content) return null
              return (
                <div key={w.key} className={`${spanClass} w-full transition-all duration-200`}>
                  {content}
                </div>
              )
            })}
          {executiveWidgets.every((w) => !w.visible) && (
            <div className="col-span-full p-8 text-center border border-dashed border-zinc-800 text-zinc-500 font-mono text-xs space-y-2">
              <p className="text-zinc-400 font-bold">No hay widgets visibles en la vista ejecutiva.</p>
              <p>Abre «Personalizar Bento» arriba para activar los bloques que desees ver.</p>
              <button
                type="button"
                onClick={resetWidgets}
                className="mt-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-sky-400 border border-zinc-800 text-xs font-mono inline-flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> Restaurar distribución original
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Drawer 360° Polimórfico (Ficha de Lead o Preview Contextual) */}
      <Drawer
        open={selectedLeadId !== null}
        onClose={() => setSelectedLeadId(null)}
        title="Ficha 360° del Prospecto"
      >
        {selectedLeadId !== null && (
          <CrmLeadDrawer
            leadId={selectedLeadId}
            canEdit={canEdit}
            assignees={assignees}
            segments={segments}
            onUpdated={() => {
              // Refresca los server components del dashboard: nombres, valores,
              // prioridades y seguimientos reflejan el guardado sin recargar
              router.refresh()
            }}
          />
        )}
      </Drawer>

      {/* Drawer Contextual para Citas / Cobros / Tareas de la Agenda */}
      <Drawer
        open={selectedAgendaItem !== null}
        onClose={() => setSelectedAgendaItem(null)}
        title={selectedAgendaItem ? selectedAgendaItem.label : 'Detalle'}
      >
        {selectedAgendaItem && (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 oled-subcard space-y-2 border-l-2 border-sky-400">
              <span
                className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 ${
                  agendaTypeBadge[selectedAgendaItem.type].cls
                }`}
              >
                {agendaTypeBadge[selectedAgendaItem.type].label}
              </span>
              <h3 className="text-sm font-bold text-white mt-1">{selectedAgendaItem.label}</h3>
              <p className="text-zinc-400 text-xs">{selectedAgendaItem.sublabel}</p>
              <div className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-900 flex items-center gap-1.5">
                <Clock size={12} className="text-zinc-400" />
                <span>Fecha: {agendaDateFmt.format(new Date(selectedAgendaItem.date))}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Link
                href={selectedAgendaItem.href}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-bold uppercase transition"
              >
                <span>Abrir en módulo completo</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
