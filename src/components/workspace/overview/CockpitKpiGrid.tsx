import Link from 'next/link'
import { BadgeDollarSign, PieChart, ShieldAlert, TrendingDown, TrendingUp, Users, Zap } from 'lucide-react'
import type { WorkspaceOverviewMetrics } from './types'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function CockpitKpiGrid({ metrics }: { metrics: WorkspaceOverviewMetrics }) {
  const {
    revenueMonthTotal,
    revenueMonthCount,
    revenueTrendPct,
    weightedPipelineTotal,
    totalLeadsActive,
    weightedProbabilityPct,
    leadsNuevoCount,
    globalConversionRate,
    overdueTasksCount,
    metaHealthPct,
    critical24hCount,
    openConvCount,
  } = metrics

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Cobrado en el Mes */}
      <article className="p-4 oled-card space-y-2.5">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <span>Cobrado en el Mes</span>
          <span className="p-1.5 bg-sky-950/80 text-sky-400 border border-sky-800/80">
            <BadgeDollarSign className="w-4 h-4" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-black text-white font-mono">{currency.format(revenueMonthTotal)}</span>
          {revenueTrendPct !== null && (
            <span
              className={`text-xs font-mono font-bold flex items-center gap-0.5 ${revenueTrendPct >= 0 ? 'text-sky-400' : 'text-rose-400'}`}
            >
              {revenueTrendPct >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {revenueTrendPct >= 0 ? '+' : ''}
              {revenueTrendPct.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          {revenueMonthCount} pago{revenueMonthCount !== 1 ? 's' : ''} confirmado
          {revenueMonthCount !== 1 ? 's' : ''}
          {revenueTrendPct === null && ' · sin mes anterior para comparar'}
        </div>
      </article>

      {/* Pipeline Ponderado */}
      <article className="p-4 oled-card space-y-2.5">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <span>Pipeline Ponderado</span>
          <span className="p-1.5 bg-indigo-950/80 text-indigo-400 border border-indigo-800/80">
            <PieChart className="w-4 h-4" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-black text-white font-mono">{currency.format(weightedPipelineTotal)}</span>
          <span className="text-xs font-mono font-bold text-indigo-400">{totalLeadsActive} tratos</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
            <span>Probabilidad ponderada (modelo por etapa)</span>
            <span className="font-bold text-indigo-400">{weightedProbabilityPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, weightedProbabilityPct)}%` }} />
          </div>
        </div>
      </article>

      {/* Leads en Gestión */}
      <article className="p-4 oled-card space-y-2.5">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <span>Leads en Gestión</span>
          <span className="p-1.5 bg-cyan-950/80 text-cyan-400 border border-cyan-800/80">
            <Users className="w-4 h-4" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-black text-white font-mono">{totalLeadsActive}</span>
          <span className="text-xs font-mono font-bold text-cyan-400">+{leadsNuevoCount} nuevos</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
            <span>Conversión a cliente</span>
            <span className="font-bold text-white">
              {globalConversionRate !== null ? `${globalConversionRate.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
            <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, globalConversionRate ?? 0)}%` }} />
          </div>
        </div>
      </article>

      {/* Tareas Vencidas */}
      <article className="p-4 oled-card space-y-2.5">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <span>Tareas Vencidas</span>
          <span className="p-1.5 bg-amber-950/80 text-amber-400 border border-amber-800/80">
            <Zap className="w-4 h-4" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-black text-white font-mono">{overdueTasksCount}</span>
          <Link href="/workspace/tasks" className="text-xs font-mono font-bold text-amber-400 hover:underline">
            Ver tareas →
          </Link>
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          {overdueTasksCount > 0 ? 'Requieren atención inmediata' : 'Todo al día'}
        </div>
      </article>

      {/* Ventana WhatsApp 24H */}
      <article className="p-4 oled-card space-y-2.5">
        <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <span>Ventana WhatsApp 24H</span>
          <span className="p-1.5 bg-rose-950/80 text-rose-400 border border-rose-800/80">
            <ShieldAlert className="w-4 h-4" />
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-black text-white font-mono">{metaHealthPct.toFixed(1)}%</span>
          <span className="text-xs font-mono font-bold text-rose-400">
            {critical24hCount > 0 ? `${critical24hCount} por vencer` : '0 críticas'}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-zinc-400">
            <span>{openConvCount} activas en inbox</span>
            <span className="font-bold text-white font-mono">
              {critical24hCount > 0 ? 'Acción requerida' : 'Saludable'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
            <div className="h-full bg-rose-500" style={{ width: `${metaHealthPct}%` }} />
          </div>
        </div>
      </article>
    </section>
  )
}
