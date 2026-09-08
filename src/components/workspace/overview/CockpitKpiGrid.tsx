import Link from 'next/link'
import { BadgeDollarSign, PieChart, ShieldAlert, TrendingDown, TrendingUp, Users, Wallet, Zap } from 'lucide-react'
import type { TimeRangeKey, WorkspaceOverviewMetrics } from './types'
import { Sparkline } from '@/components/workspace/charts'

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

/** Chip ▲/▼ de variación % del período vs el previo; oculto si no hay base de comparación. */
function TrendChip({ pct }: { pct: number | null }) {
  if (pct === null) return null
  return (
    <span
      className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${pct >= 0 ? 'text-sky-400' : 'text-rose-400'}`}
    >
      {pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pct >= 0 ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}

/** Card KPI compacta y uniforme: label+icono / valor+chip / detalle. Misma altura en la fila. */
function Kpi({
  label,
  icon: Icon,
  accent,
  value,
  trend,
  detail,
  footer,
}: {
  label: string
  icon: typeof BadgeDollarSign
  accent: 'sky' | 'indigo' | 'cyan' | 'amber' | 'rose'
  value: React.ReactNode
  trend?: React.ReactNode
  detail?: React.ReactNode
  footer?: React.ReactNode
}) {
  const accentCls: Record<string, string> = {
    sky: 'bg-sky-950/80 text-sky-400 border-sky-800/80',
    indigo: 'bg-indigo-950/80 text-indigo-400 border-indigo-800/80',
    cyan: 'bg-cyan-950/80 text-cyan-400 border-cyan-800/80',
    amber: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
    rose: 'bg-rose-950/80 text-rose-400 border-rose-800/80',
  }
  return (
    <article className="p-3 oled-card flex flex-col gap-2 min-h-[104px]">
      <div className="flex items-center justify-between text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
        <span className="truncate">{label}</span>
        <span className={`p-1 ${accentCls[accent]} shrink-0`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-white leading-none">{value}</span>
        {trend}
      </div>
      <div className="mt-auto text-[10px] font-mono text-zinc-500 leading-relaxed">
        {detail}
        {footer}
      </div>
    </article>
  )
}

function MiniBar({ pct, cls }: { pct: number; cls: string }) {
  return (
    <div className="h-1 w-full bg-zinc-900 overflow-hidden">
      <div className={`h-full ${cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
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
    leadsCreatedInPeriod,
    conversionsInPeriod,
    leadsNuevosTrendPct,
    conversionTrendPct,
    globalConversionRate,
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
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 items-stretch">
      <Kpi
        label={periodLabel}
        icon={BadgeDollarSign}
        accent="sky"
        value={currency.format(revenuePeriodTotal)}
        trend={<TrendChip pct={revenueTrendPct} />}
        detail={
          <>
            {revenuePeriodCount} pago{revenuePeriodCount !== 1 ? 's' : ''}
            {averageTicket > 0 && ` · ${currency.format(averageTicket)} c/u`}
          </>
        }
        footer={
          revenueSeries && revenueSeries.length > 1 ? (
            <span className="block mt-1">
              <Sparkline data={revenueSeries} />
            </span>
          ) : null
        }
      />

      <Kpi
        label="Pipeline Ponderado"
        icon={PieChart}
        accent="indigo"
        value={currency.format(weightedPipelineTotal)}
        detail={
          <>
            <span className="flex justify-between text-zinc-500">
              <span>{totalLeadsActive} tratos · prob.</span>
              <span className="font-bold text-indigo-400">{weightedProbabilityPct.toFixed(0)}%</span>
            </span>
            <MiniBar pct={weightedProbabilityPct} cls="bg-indigo-500" />
          </>
        }
      />

      <Kpi
        label="Leads en Gestión"
        icon={Users}
        accent="cyan"
        value={totalLeadsActive}
        trend={<TrendChip pct={leadsNuevosTrendPct} />}
        detail={
          <>
            <span className="flex justify-between text-zinc-500">
              <span>{leadsCreatedInPeriod} nuevos · conv.</span>
              <span className="font-bold text-white">{globalConversionRate !== null ? `${globalConversionRate.toFixed(0)}%` : '—'}</span>
            </span>
            <MiniBar pct={globalConversionRate ?? 0} cls="bg-cyan-400" />
          </>
        }
        footer={conversionTrendPct !== null ? <span className="text-[10px]">conv. del período <strong className={conversionTrendPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{conversionTrendPct >= 0 ? '+' : ''}{conversionTrendPct.toFixed(0)}%</strong> · {conversionsInPeriod} conv.</span> : null}
      />

      <Kpi
        label="Tareas Vencidas"
        icon={Zap}
        accent="amber"
        value={overdueTasksCount}
        detail={
          <>
            {overdueTasksCount > 0 ? 'Requieren atención inmediata' : 'Todo al día'}
            <br />
            <Link href="/workspace/tasks" className="text-amber-400 hover:underline font-bold">
              Ver tareas →
            </Link>
          </>
        }
      />

      <Kpi
        label="Por Cobrar"
        icon={Wallet}
        accent="amber"
        value={currency.format(revenuePendingTotal)}
        detail={
          <>
            {revenuePendingCount} pendiente{revenuePendingCount !== 1 ? 's' : ''}
            {overduePaymentsCount > 0 && (
              <span className="text-amber-400 font-bold"> · {overduePaymentsCount} vencido{overduePaymentsCount !== 1 ? 's' : ''}</span>
            )}
            <br />
            <Link href="/workspace/billing" className="text-amber-400 hover:underline font-bold">
              Facturación →
            </Link>
            {quotesActiveTotal > 0 && <span className="text-zinc-600"> · {quotesActiveCount} cotiz.</span>}
          </>
        }
      />

      <Kpi
        label="Ventana WhatsApp 24H"
        icon={ShieldAlert}
        accent="rose"
        value={`${metaHealthPct.toFixed(0)}%`}
        detail={
          <>
            <span className="flex justify-between text-zinc-500">
              <span>{openConvCount} activas</span>
              <span className={critical24hCount > 0 ? 'font-bold text-rose-400' : 'font-bold text-zinc-400'}>
                {critical24hCount > 0 ? `${critical24hCount} por vencer` : 'saludable'}
              </span>
            </span>
            <MiniBar pct={metaHealthPct} cls="bg-rose-500" />
          </>
        }
      />
    </section>
  )
}
