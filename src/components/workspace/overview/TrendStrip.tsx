import { TrendingUp, TrendingDown } from 'lucide-react'

import { OledCard } from '@/components/workspace/oled'
import type { MonthlySeries } from '@/lib/trend-widgets'

/**
 * Mini-sparklines del Resumen (estilo dashboard, dentro del sistema OLED):
 * 3 series de 6 meses en SVG puro — sin librería de charts.
 */

const MES_LABEL: Record<string, string> = {
  '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic',
}

function SparkBars({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-full rounded-sm ${i === values.length - 1 ? accent : 'bg-zinc-800'}`}
          style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  )
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

/** Chip ▲/▼ de variación % (mes completo anterior vs su previo); oculto si no hay base de comparación. */
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return null
  return (
    <span
      title="Δ% del último mes completo vs el anterior"
      className={`flex items-center gap-1 text-[10px] font-mono ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
    >
      {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {delta >= 0 ? '+' : ''}
      {Math.round(delta)}%
    </span>
  )
}

export function TrendStrip({ trends }: { trends: MonthlySeries }) {
  const monthLabels = trends.months.map((m) => MES_LABEL[m.slice(5)] ?? m.slice(5))

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Tendencias de 6 meses">
      <OledCard>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Cobrado · 6 meses</p>
          <DeltaChip delta={trends.cobradoDeltaPct} />
        </div>
        <p className="mt-1 text-xl font-bold font-mono text-white">{fmtMoney(trends.cobrado[5] ?? 0)} <span className="text-[10px] font-normal text-zinc-600">este mes</span></p>
        <div className="mt-2">
          <SparkBars values={trends.cobrado} accent="bg-emerald-500/70" />
        </div>
        <div className="mt-1 flex justify-between text-[8px] font-mono text-zinc-600">
          {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </OledCard>

      <OledCard>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Leads nuevos · 6 meses</p>
          <DeltaChip delta={trends.leadsNuevosDeltaPct} />
        </div>
        <p className="mt-1 text-xl font-bold font-mono text-white">{trends.leadsNuevos[5] ?? 0} <span className="text-[10px] font-normal text-zinc-600">este mes</span></p>
        <div className="mt-2">
          <SparkBars values={trends.leadsNuevos} accent="bg-sky-500/70" />
        </div>
        <div className="mt-1 flex justify-between text-[8px] font-mono text-zinc-600">
          {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </OledCard>

      <OledCard>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Actividades · 6 meses</p>
          <DeltaChip delta={trends.actividadesDeltaPct} />
        </div>
        <p className="mt-1 text-xl font-bold font-mono text-white">{trends.actividades[5] ?? 0} <span className="text-[10px] font-normal text-zinc-600">este mes</span></p>
        <div className="mt-2">
          <SparkBars values={trends.actividades} accent="bg-amber-500/70" />
        </div>
        <div className="mt-1 flex justify-between text-[8px] font-mono text-zinc-600">
          {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </OledCard>
    </section>
  )
}
