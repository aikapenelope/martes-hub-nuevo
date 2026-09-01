'use client'

/**
 * Charts compartidos del workspace, sobre Recharts (SVG, compatible con
 * React 19, usado también por los componentes de chart de shadcn/ui).
 * Todos reciben los datos ya calculados desde el Server Component que los
 * usa — nunca generan ni completan datos por su cuenta.
 */

import {
  Area,
  AreaChart,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const PALETTE = ['#38bdf8', '#818cf8', '#fbbf24', '#f43f5e', '#22d3ee', '#a3e635']

function ChartTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: Array<{ value: number; name?: string }>; label?: string; formatter?: (v: number) => string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs font-mono shadow-xl">
      {label && <div className="text-zinc-400">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="font-bold text-white">
          {p.name ? `${p.name}: ` : ''}
          {formatter ? formatter(p.value) : p.value}
        </div>
      ))}
    </div>
  )
}

/** Línea/área de tendencia — usada para ingresos mensuales. */
export function RevenueTrendChart({
  data,
  unit = 'USD',
}: {
  data: { label: string; value: number }[]
  /** Sufijo de divisa para el tooltip; el formateo ocurre dentro del cliente
   * porque una Server Component no puede pasar funciones a un Client Component. */
  unit?: string
}) {
  const currency = new Intl.NumberFormat('es-VE', { style: 'currency', currency: unit, maximumFractionDigits: 0 })
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip formatter={(v) => currency.format(v)} />} />
        <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} fill="url(#revenueGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Donut de composición (clientes por etapa, leads por canal, etc). */
export function DonutChart({
  data,
}: {
  data: { label: string; value: number }[]
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0)
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={38} outerRadius={56} paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white font-mono">{total}</span>
          <span className="text-[9px] text-zinc-500 font-mono uppercase">total</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="text-zinc-300">{d.label}</span>
            <span className="ml-auto font-mono font-bold text-white">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mini-tendencia inline para una KpiCard — sin ejes, sin tooltip, solo la forma. */
export function Sparkline({ data, color = '#38bdf8' }: { data: number[]; color?: string }) {
  const points = data.map((value, i) => ({ i, value }))
  return (
    <ResponsiveContainer width={72} height={28}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Area type="monotone" dataKey="value" stroke="none" fill={`url(#spark-${color.replace('#', '')})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
