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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  clients: Client[] | null
  data: WorkspaceOverviewData
  agenda: AgendaItem[] | null
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
              <h2 className="text-xs font-mono uppercase tracking-wider text-foreground/80 flex items-center gap-2">
                <span className="w-2 h-2 bg-sky-400 inline-block shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
                Agenda próxima · 7 días {agenda !== null ? `(${agenda.length})` : ''}
              </h2>
              <Link
                href="/workspace/calendar"
                className="text-[11px] font-mono text-sky-400 hover:text-sky-300 transition flex items-center gap-1 font-bold"
              >
                Ver calendario completo →
              </Link>
            </div>

            <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
              {agenda === null ? (
                <div className="p-6 text-center text-xs font-mono text-muted-foreground space-y-1">
                  <p className="font-bold text-destructive">No se pudo cargar la agenda.</p>
                  <p className="text-[11px]">
                    Hubo un problema al consultar los eventos próximos. Recarga la página para reintentar.
                  </p>
                </div>
              ) : agenda.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-muted-foreground space-y-1">
                  <Zap size={20} className="mx-auto text-muted-foreground/60 mb-2" />
                  <p className="font-bold text-foreground">Nada pendiente en la agenda esta semana.</p>
                  <p className="text-[11px]">
                    Las reuniones agendadas en Google Calendar, cobros y tareas aparecerán aquí automáticamente.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
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
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition group cursor-pointer"
                      >
                        <span className="text-muted-foreground group-hover:text-foreground transition shrink-0">
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
                            <strong className="truncate text-sm text-foreground group-hover:text-sky-300 transition">
                              {item.label}
                            </strong>
                            <span
                              className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 shrink-0 ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground truncate block mt-0.5">
                            {item.sublabel}
                          </span>
                        </div>

                        <span className="shrink-0 text-[11px] font-mono text-muted-foreground text-right">
                          {agendaDateFmt.format(new Date(item.date))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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
            hourBuckets={data.hourBuckets}
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

      {/* 3. Selector de Vistas de Enfoque (Tabs) & Bento Customizer */}
      <nav
        aria-label="Vistas de enfoque del tablero"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-border py-2.5"
      >
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40 gap-1">
          <button
            type="button"
            onClick={() => handleSelectView('operativa')}
            className={cn(
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors',
              activeView === 'operativa'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Activity className="size-3.5 text-sky-400" />
            <span>Operativa · Hoy</span>
            {urgentCount > 0 ? (
              <Badge variant="warning" className="text-[10px] h-4 px-1.5 font-semibold">
                {urgentCount}
              </Badge>
            ) : (
              <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectView('ejecutiva')}
            className={cn(
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors',
              activeView === 'ejecutiva'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <BarChart3 className="size-3.5 text-indigo-400" />
            <span>Ejecutiva · Rendimiento</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              KPIs
            </Badge>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Button
            type="button"
            variant={showConfig ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
            className="h-8 gap-2 text-xs font-medium"
            title="Personalizar bloques visibles del Bento"
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Personalizar Bento</span>
          </Button>

          <div className="hidden lg:flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
              <span className="text-foreground/90 font-medium">Telemetría activa</span>
            </span>
            <span>·</span>
            <span className="text-muted-foreground text-xs">
              {activeView === 'operativa'
                ? 'Acción inmediata, agenda y seguimiento'
                : 'Salud comercial, conversión y finanzas'}
            </span>
          </div>
        </div>
      </nav>

      {/* Panel Desplegable: Personalización del Bento Modular y Elástico */}
      {showConfig && (
        <div className="p-3.5 border border-sky-900/50 bg-sky-950/15 text-card-foreground space-y-3 animate-fadeIn font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
            <div className="flex items-center gap-2">
              <LayoutGrid size={15} className="text-sky-400" />
              <span className="font-bold text-foreground text-sm">
                Personalizar Bento ({activeView === 'operativa' ? 'Vista Operativa' : 'Vista Ejecutiva'})
              </span>
              <span className="hidden sm:inline text-[10px] text-muted-foreground bg-muted px-2 py-0.5 border border-border">
                Auto-flow elástico
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={resetWidgets}
              className="h-auto self-start sm:self-auto gap-1.5 border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw size={12} /> Restaurar distribución original
            </Button>
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
                      ? 'bg-background/90 border-border hover:border-muted-foreground/40'
                      : 'bg-background/80 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleWidget(w.key, isExec)}
                      className="flex min-w-0 items-center gap-2 text-left hover:text-sky-300"
                      title={w.visible ? 'Ocultar widget' : 'Mostrar widget'}
                    >
                      {w.visible ? (
                        <Eye size={13} className="text-emerald-400 shrink-0" />
                      ) : (
                        <EyeOff size={13} className="text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={`text-xs truncate font-sans font-medium ${
                          w.visible ? 'text-foreground/90' : 'text-muted-foreground line-through'
                        }`}
                      >
                        {w.label}
                      </span>
                    </Button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isFirst}
                        onClick={() => moveWidget(w.key, 'up', isExec)}
                        className="h-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20"
                        title="Subir posición"
                      >
                        <ArrowUp size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isLast}
                        onClick={() => moveWidget(w.key, 'down', isExec)}
                        className="h-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20"
                        title="Bajar posición"
                      >
                        <ArrowDown size={12} />
                      </Button>
                    </div>
                  </div>

                  {w.visible && (
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border text-[10px]">
                      <span className="text-muted-foreground font-mono">Ancho:</span>
                      <div className="inline-flex items-center bg-muted/90 border border-border p-0.5 rounded gap-0.5">
                        {(
                          [
                            { id: 'compact' as const, label: '1/3' },
                            { id: 'normal' as const, label: '1/2' },
                            { id: 'wide' as const, label: '2/3' },
                            { id: 'full' as const, label: 'Full' },
                          ] as const
                        ).map((opt) => (
                          <Button
                            key={opt.id}
                            type="button"
                            variant="ghost"
                            onClick={() => updateWidgetSpan(w.key, opt.id, isExec)}
                            className={`h-auto rounded-none px-1.5 py-0.5 font-mono transition ${
                              currentSpan === opt.id
                                ? 'bg-sky-400 text-black font-bold shadow-sm'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                            title={`Tamaño ${opt.label}`}
                          >
                            {opt.label}
                          </Button>
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
            <div className="col-span-full p-8 text-center border border-dashed border-border text-muted-foreground font-mono text-xs space-y-2">
              <p className="font-bold text-foreground">No hay widgets visibles en la vista operativa.</p>
              <p>Abre «Personalizar Bento» arriba para activar los bloques que desees ver.</p>
              <Button
                type="button"
                variant="ghost"
                onClick={resetWidgets}
                className="mt-2 h-auto gap-1.5 border-border bg-muted px-3 py-1.5 font-mono text-xs text-sky-400 hover:bg-accent"
              >
                <RotateCcw size={12} /> Restaurar distribución original
              </Button>
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
            <div className="col-span-full p-8 text-center border border-dashed border-border text-muted-foreground font-mono text-xs space-y-2">
              <p className="font-bold text-foreground">No hay widgets visibles en la vista ejecutiva.</p>
              <p>Abre «Personalizar Bento» arriba para activar los bloques que desees ver.</p>
              <Button
                type="button"
                variant="ghost"
                onClick={resetWidgets}
                className="mt-2 h-auto gap-1.5 border-border bg-muted px-3 py-1.5 font-mono text-xs text-sky-400 hover:bg-accent"
              >
                <RotateCcw size={12} /> Restaurar distribución original
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 4. Sheet 360° Polimórfico (Ficha de Lead o Preview Contextual) */}
      <Sheet
        open={selectedLeadId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Ficha 360° del Prospecto
            </SheetTitle>
            <SheetDescription className="sr-only">Ficha CRM 360° del prospecto</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
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
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet Contextual para Citas / Cobros / Tareas de la Agenda */}
      <Sheet
        open={selectedAgendaItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAgendaItem(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              {selectedAgendaItem ? selectedAgendaItem.label : 'Detalle'}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Detalle del elemento de la agenda
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {selectedAgendaItem && (
              <div className="space-y-4 font-mono text-xs">
                <div className="p-3 space-y-2 border border-sky-400 border-l-2 bg-muted/40">
                  <span
                    className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 ${
                      agendaTypeBadge[selectedAgendaItem.type].cls
                    }`}
                  >
                    {agendaTypeBadge[selectedAgendaItem.type].label}
                  </span>
                  <h3 className="text-sm font-bold text-foreground mt-1">{selectedAgendaItem.label}</h3>
                  <p className="text-muted-foreground text-xs">{selectedAgendaItem.sublabel}</p>
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border flex items-center gap-1.5">
                    <Clock size={12} className="text-muted-foreground" />
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
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
