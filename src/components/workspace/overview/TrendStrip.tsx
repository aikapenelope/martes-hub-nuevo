import { TrendingUp, TrendingDown } from 'lucide-react'

import { OledCard } from '@/components/workspace/oled'
import type { MonthlySeries } from '@/lib/trend-widgets'

/**
 * Mini-tendencias del Resumen en UNA sola barra (3 series de 6 meses, SVG puro):
 * compactación del patrón dashboard-9 — menos cards, misma información.
 */

function SparkBars({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
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

/** Chip ▲/▼ de variación % (mes completo anterior vs su previo); oculto sin base. */
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

interface TrendStatProps {
  label: string
  value: string
  delta: number | null
  values: number[]
  accent: string
}

function TrendStat({ label, value, delta, values, accent }: TrendStatProps) {
  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
        <DeltaChip delta={delta} />
      </div>
      <p className="text-lg font-bold font-mono text-white leading-none">
        {value} <span className="text-[10px] font-normal text-zinc-600">este mes</span>
      </p>
      <SparkBars values={values} accent={accent} />
      <p className="sr-only">Serie de 6 meses: {values.join(', ')}</p>
    </div>
  )
}

export function TrendStrip({ trends }: { trends: MonthlySeries }) {
  return (
    <OledCard className="!p-0 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
        <TrendStat
          label="Cobrado · 6 meses"
          value={fmtMoney(trends.cobrado[5] ?? 0)}
          delta={trends.cobradoDeltaPct}
          values={trends.cobrado}
          accent="bg-emerald-500/70"
        />
        <TrendStat
          label="Leads nuevos · 6 meses"
          value={String(trends.leadsNuevos[5] ?? 0)}
          delta={trends.leadsNuevosDeltaPct}
          values={trends.leadsNuevos}
          accent="bg-sky-500/70"
        />
        <TrendStat
          label="Actividades · 6 meses"
          value={String(trends.actividades[5] ?? 0)}
          delta={trends.actividadesDeltaPct}
          values={trends.actividades}
          accent="bg-amber-500/70"
        />
      </div>
    </OledCard>
  )
}
