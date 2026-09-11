import Link from 'next/link'
import { BadgeDollarSign, PieChart, ShieldAlert, Users, Wallet, Zap, ArrowRight } from 'lucide-react'
import type { TimeRangeKey, WorkspaceOverviewMetrics } from './types'
import { Sparkline } from '@/components/workspace/charts'
import { DashboardCard } from '@/components/dashboard-card'
import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Delta, DeltaIcon, DeltaValue } from '@/components/delta'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const RANGE_LABELS: Record<TimeRangeKey, string> = {
  hoy: 'Cobrado Hoy',
  '7d': 'Cobrado en 7 Días',
  '30d': 'Cobrado en el Mes',
  '90d': 'Cobrado en 90 Días',
  ano: 'Cobrado en el Año',
}

export function CockpitKpiGrid({
  metrics,
  revenueSeries,
  timeRange = '30d',
}: {
  metrics: WorkspaceOverviewMetrics
  /** Serie mensual de ingresos cobrados (meses antiguos → recientes) para la sparkline. */
  revenueSeries?: number[]
  timeRange?: TimeRangeKey
}) {
  const {
    revenuePeriodTotal,
    revenuePeriodCount,
    revenueTrendPct,
    weightedPipelineTotal,
    totalLeadsActive,
    weightedProbabilityPct,
    globalConversionRate,
    leadsCreatedInPeriod,
    conversionsInPeriod,
    leadsNuevosTrendPct,
    conversionTrendPct: _conversionTrendPct,
    overdueTasksCount,
    metaHealthPct,
    critical24hCount,
    openConvCount,
    revenuePendingTotal,
    revenuePendingCount,
    overduePaymentsCount,
    averageTicket,
    quotesActiveCount,
    quotesActiveTotal,
  } = metrics

  const periodLabel = RANGE_LABELS[timeRange] ?? 'Cobrado en el Período'

  return (
    <section className="grid grid-cols-1 gap-px bg-border p-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Métricas comerciales">
      {/* Cobrado en el Período */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            {periodLabel}
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-sky-500/20 bg-sky-500/10 text-sky-400">
            <BadgeDollarSign className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{currency.format(revenuePeriodTotal)}</p>
            {revenueSeries && revenueSeries.length > 1 && (
              <div className="w-16 shrink-0">
                <Sparkline data={revenueSeries} />
              </div>
            )}
          </div>
          <p className="text-[11px] font-mono text-muted-foreground truncate">
            {revenuePeriodCount} pago{revenuePeriodCount !== 1 ? 's' : ''}
            {averageTicket > 0 && ` · Prom: ${currency.format(averageTicket)}`}
          </p>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          {revenueTrendPct !== null ? (
            <>
              <Delta value={revenueTrendPct} variant="badge">
                <DeltaIcon variant="trend" />
                <DeltaValue />
              </Delta>
              <span className="text-[11px]">vs anterior</span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Sin periodo anterior</span>
          )}
        </CardFooter>
      </DashboardCard>

      {/* Pipeline Ponderado */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Pipeline Ponderado
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
            <PieChart className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{currency.format(weightedPipelineTotal)}</p>
            <span className="text-xs font-mono font-bold text-indigo-400">{totalLeadsActive} tratos</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>Probabilidad</span>
              <span className="font-bold text-indigo-400">{weightedProbabilityPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, weightedProbabilityPct)}%` }} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          <span className="text-[11px] text-muted-foreground">Modelo por etapa</span>
        </CardFooter>
      </DashboardCard>

      {/* Leads en Gestión */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Leads en Gestión
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            <Users className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{totalLeadsActive}</p>
            <span className="text-xs font-mono font-bold text-cyan-400 truncate">
              {leadsCreatedInPeriod} nuevos
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>Conv: {globalConversionRate !== null ? `${globalConversionRate.toFixed(1)}%` : '—'}</span>
              <span className="text-muted-foreground truncate">· {conversionsInPeriod} conv.</span>
            </div>
            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
              <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(100, globalConversionRate ?? 0)}%` }} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          {leadsNuevosTrendPct !== null ? (
            <>
              <Delta value={leadsNuevosTrendPct} variant="badge">
                <DeltaIcon variant="trend" />
                <DeltaValue />
              </Delta>
              <span className="text-[11px]">nuevos</span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Captación estable</span>
          )}
        </CardFooter>
      </DashboardCard>

      {/* Tareas Vencidas */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Tareas Vencidas
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Zap className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-2xl font-semibold tabular-nums ${overdueTasksCount > 0 ? 'text-amber-400' : 'text-foreground'}`}>
              {overdueTasksCount}
            </p>
            <Link href="/workspace/tasks" className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-0.5">
              Ver <ArrowRight className="size-3" />
            </Link>
          </div>
          <p className="text-[11px] font-mono text-muted-foreground">
            {overdueTasksCount > 0 ? 'Requieren atención hoy' : 'Todo al día sin atrasos'}
          </p>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          <span className={`text-[11px] font-mono ${overdueTasksCount > 0 ? 'text-amber-400 font-bold' : 'text-muted-foreground'}`}>
            {overdueTasksCount > 0 ? 'Acción inmediata' : 'Flujo al día'}
          </span>
        </CardFooter>
      </DashboardCard>

      {/* Por Cobrar */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Por Cobrar
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Wallet className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{currency.format(revenuePendingTotal)}</p>
            <Link href="/workspace/billing" className="text-xs font-mono text-amber-400 hover:underline flex items-center gap-0.5">
              Cobros <ArrowRight className="size-3" />
            </Link>
          </div>
          <p className="text-[11px] font-mono text-muted-foreground truncate">
            {revenuePendingCount} cobro{revenuePendingCount !== 1 ? 's' : ''}
            {quotesActiveTotal > 0 && ` · ${quotesActiveCount} cotiz.`}
          </p>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          <span className={`text-[11px] font-mono ${overduePaymentsCount > 0 ? 'text-amber-400 font-bold' : 'text-muted-foreground'}`}>
            {overduePaymentsCount > 0 ? `${overduePaymentsCount} vencido${overduePaymentsCount !== 1 ? 's' : ''}` : 'Al día'}
          </span>
        </CardFooter>
      </DashboardCard>

      {/* Ventana WhatsApp 24H */}
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            WhatsApp 24H
          </CardTitle>
          <span className="flex size-7 items-center justify-center rounded border border-rose-500/20 bg-rose-500/10 text-rose-400">
            <ShieldAlert className="size-3.5" />
          </span>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">{metaHealthPct.toFixed(1)}%</p>
            <span className="text-xs font-mono font-bold text-rose-400 truncate">
              {critical24hCount > 0 ? `${critical24hCount} críticas` : '0 críticas'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>{openConvCount} activas</span>
              <span className="font-bold text-foreground font-mono">
                {critical24hCount > 0 ? 'Alerta SLA' : 'Saludable'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
              <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${metaHealthPct}%` }} />
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-2 gap-1.5 rounded-none text-xs text-muted-foreground">
          <span className={`text-[11px] font-mono ${critical24hCount > 0 ? 'text-rose-400 font-bold' : 'text-muted-foreground'}`}>
            {critical24hCount > 0 ? 'Atención Meta SLA' : 'Ventana activa'}
          </span>
        </CardFooter>
      </DashboardCard>
    </section>
  )
}
