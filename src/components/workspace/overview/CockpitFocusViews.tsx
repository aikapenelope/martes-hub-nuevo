'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowRight,
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
  type ExecutiveWidgetKey,
  type OperativeWidgetKey,
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

  const isOpVisible = (k: OperativeWidgetKey) => operativeWidgets.find((w) => w.key === k)?.visible ?? true
  const isExVisible = (k: ExecutiveWidgetKey) => executiveWidgets.find((w) => w.key === k)?.visible ?? true

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

      {/* Panel Desplegable: Personalización del Bento Modular */}
      {showConfig && (
        <div className="p-4 oled-card border-sky-900/50 bg-sky-950/10 space-y-3 animate-fadeIn font-mono text-xs">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="font-bold text-white flex items-center gap-2">
              <LayoutGrid size={14} className="text-sky-400" />
              Configuración de Widgets ({activeView === 'operativa' ? 'Vista Operativa' : 'Vista Ejecutiva'})
            </span>
            <button
              type="button"
              onClick={resetWidgets}
              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              <RotateCcw size={11} /> Restaurar por defecto
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeView === 'operativa'
              ? operativeWidgets.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key, false)}
                    className={`px-3 py-1.5 border text-xs flex items-center gap-2 transition ${
                      w.visible
                        ? 'bg-zinc-900 text-white border-zinc-700'
                        : 'bg-black text-zinc-600 border-zinc-900 line-through'
                    }`}
                  >
                    {w.visible ? <Eye size={12} className="text-emerald-400" /> : <EyeOff size={12} />}
                    <span>{w.label}</span>
                  </button>
                ))
              : executiveWidgets.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => toggleWidget(w.key, true)}
                    className={`px-3 py-1.5 border text-xs flex items-center gap-2 transition ${
                      w.visible
                        ? 'bg-zinc-900 text-white border-zinc-700'
                        : 'bg-black text-zinc-600 border-zinc-900 line-through'
                    }`}
                  >
                    {w.visible ? <Eye size={12} className="text-emerald-400" /> : <EyeOff size={12} />}
                    <span>{w.label}</span>
                  </button>
                ))}
          </div>
        </div>
      )}

      {/* 4. Contenido según Vista de Enfoque (Bento Modular) */}
      {activeView === 'operativa' ? (
        <div className="space-y-4 animate-fadeIn">
          {/* Tira de Alertas Operativas */}
          {isOpVisible('alerts') && <CockpitAlertStrip alerts={data.operationalAlerts} />}

          {/* Salud de Integraciones y Canales */}
          {isOpVisible('health') && <CockpitIntegrationHealth health={data.systemHealth} />}

          {/* Seguimientos Proactivos de Hoy (SLA) con apertura en Drawer */}
          {isOpVisible('followups') && (
            <CockpitFollowupsToday
              items={data.followupsToday}
              onOpenLead={(id) => setSelectedLeadId(id)}
            />
          )}

          {/* Bento Operativo: Agenda 7 Días (izq) + Feed Omnicanal (der) */}
          {(isOpVisible('agenda') || isOpVisible('feed')) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
              {/* Agenda próxima 7 días */}
              {isOpVisible('agenda') && (
                <section className={isOpVisible('feed') ? 'lg:col-span-7 space-y-2' : 'lg:col-span-12 space-y-2'}>
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
                          // Cita vinculada a un cliente: la ficha principal es
                          // la del cliente (syncGcal puede poblar ambos) —
                          // abrir el drawer de lead usaría el vínculo equivocado.
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
              )}

              {/* Feed Omnicanal en Vivo */}
              {isOpVisible('feed') && (
                <section className={isOpVisible('agenda') ? 'lg:col-span-5' : 'lg:col-span-12'}>
                  <CockpitOmnichannelFeed
                    conversations={data.recentConversations}
                    summaries={data.recentSummaries}
                    emails={data.recentEmails}
                    payments={data.recentPayments}
                    nowTime={data.nowTime}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-fadeIn">
          {/* Salud de Integraciones & Canales (única instancia en esta vista;
              en la operativa vive como widget del bento) */}
          <CockpitIntegrationHealth health={data.systemHealth} />

          {/* Tarjetas KPI de Rendimiento */}
          {isExVisible('kpis') && (
            <CockpitKpiGrid
              metrics={data.metrics}
              revenueSeries={data.cashflowPoints.map((p) => p.paid)}
              timeRange={data.timeRange}
            />
          )}

          {/* Bento Superior: Flujo de Caja (7 cols) + Embudo de Conversión (5 cols) */}
          {(isExVisible('cashflow') || isExVisible('funnel')) && (
            <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
              {isExVisible('cashflow') && (
                <div className={isExVisible('funnel') ? 'lg:col-span-7' : 'lg:col-span-12'}>
                  <CockpitCashflowChart points={data.cashflowPoints} />
                </div>
              )}
              {isExVisible('funnel') && (
                <div className={isExVisible('cashflow') ? 'lg:col-span-5' : 'lg:col-span-12'}>
                  <CockpitConversionFunnel metrics={data.metrics} />
                </div>
              )}
            </section>
          )}

          {/* Bento Medio: Matriz Anual Heatmap (8 cols) + Canales de Captación (4 cols) */}
          {(isExVisible('heatmap') || isExVisible('sources')) && (
            <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
              {isExVisible('heatmap') && (
                <div className={isExVisible('sources') ? 'lg:col-span-8' : 'lg:col-span-12'}>
                  <ActivityHeatmap
                    daysData={data.dayBuckets}
                    totalInteractions={data.totalYearInteractions}
                  />
                </div>
              )}
              {isExVisible('sources') && (
                <div className={isExVisible('heatmap') ? 'lg:col-span-4' : 'lg:col-span-12'}>
                  <CockpitSourceBreakdown sources={data.sourceBreakdown} />
                </div>
              )}
            </section>
          )}

          {/* Bento Inferior: Radar de Prioridades Comerciales con apertura en Drawer */}
          {isExVisible('priorities') && (
            <section>
              <CockpitPipelinePriorities
                hotLeads={data.hotLeads}
                onOpenLead={(id) => setSelectedLeadId(id)}
              />
            </section>
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
