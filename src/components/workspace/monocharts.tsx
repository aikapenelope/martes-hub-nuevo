'use client'

import React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Escala tonal monocromática OLED:
 * Blanco puro para el dato activo o principal, pasando por grises de precisión
 * hasta el fondo negro profundo.
 */
export const MONO_PALETTE = [
  '#ffffff', // Principal / Máxima prioridad
  '#d4d4d8', // zinc-300
  '#a1a1aa', // zinc-400
  '#71717a', // zinc-500
  '#52525b', // zinc-600
  '#3f3f46', // zinc-700
]

export interface MonoTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name?: string }>
  label?: string
  formatter?: (v: number) => string
}

export function MonoTooltip({ active, payload, label, formatter }: MonoTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="border border-zinc-800 bg-black/95 px-3 py-2 text-xs font-mono shadow-2xl backdrop-blur-md">
      {label && <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 font-bold text-white">
          {p.name && <span className="text-zinc-400 font-normal">{p.name}:</span>}
          <span>{formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Gráfico de Área / Tendencia Monocromático:
 * Gradiente sutil blanco/gris con trazo fino nítido, ejes discretos y animación suave.
 */
export function MonoAreaChart({
  data,
  height = 200,
  unit = 'USD',
  accentColor = '#ffffff',
}: {
  data: { label: string; value: number }[]
  height?: number
  unit?: string
  accentColor?: string
}) {
  const currency = new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: unit,
    maximumFractionDigits: 0,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="monoAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#27272a' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#52525b', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <Tooltip content={<MonoTooltip formatter={(v) => currency.format(v)} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={accentColor}
            strokeWidth={1.75}
            fill="url(#monoAreaGradient)"
            isAnimationActive={true}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Gráfico Donut Monocromático Delgado (Estilo Monocharts):
 * Anillo ultra fino con métrica central en tipografía monoespaciada y leyenda lateral jerarquizada.
 */
export function MonoDonutChart({
  data,
  innerRadius = 40,
  outerRadius = 52,
  centerLabel = 'TOTAL',
}: {
  data: { label: string; value: number; color?: string }[]
  innerRadius?: number
  outerRadius?: number
  centerLabel?: string
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0)

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={3}
              stroke="#09090b"
              strokeWidth={2}
              isAnimationActive={true}
              animationDuration={800}
            >
              {data.map((item, i) => (
                <Cell
                  key={i}
                  fill={item.color || MONO_PALETTE[i % MONO_PALETTE.length]}
                />
              ))}
            </Pie>
            <Tooltip
              content={
                <MonoTooltip
                  formatter={(v) => `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-black text-white font-mono tracking-tight">{total}</span>
          <span className="text-[8px] text-zinc-500 font-mono uppercase tracking-widest">{centerLabel}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-xs w-full">
        {data.map((d, i) => {
          const color = d.color || MONO_PALETTE[i % MONO_PALETTE.length]
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0'
          return (
            <div key={d.label} className="flex items-center gap-2 font-mono">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-zinc-400 truncate text-[11px]">{d.label}</span>
              <span className="ml-auto font-bold text-white text-[11px]">{d.value}</span>
              <span className="text-[10px] text-zinc-600 w-8 text-right font-normal">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Embudo Escalonado Monocromático (MonoFunnel):
 * Visualización del embudo de conversión con decaimiento visual proporcional,
 * líneas de avance y ratios de transición calculados.
 */
export interface FunnelStage {
  label: string
  count: number
  valueAmount?: number
  conversionRate?: number | null
  colorAccent?: string
}

export function MonoFunnel({
  stages,
}: {
  stages: FunnelStage[]
}) {
  const max = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div className="space-y-2.5 font-mono text-xs">
      {stages.map((stage, idx) => {
        const widthPct = Math.max(12, Math.min(100, (stage.count / max) * 100))
        const isFirst = idx === 0
        const isLast = idx === stages.length - 1

        return (
          <div key={stage.label} className="p-2.5 oled-subcard space-y-1.5 border-zinc-900/80 hover:border-zinc-800 transition">
            <div className="flex justify-between items-baseline">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 font-bold">0{idx + 1}</span>
                <span className={`font-bold ${isLast ? 'text-white' : 'text-zinc-300'}`}>
                  {stage.label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                {stage.valueAmount !== undefined && stage.valueAmount > 0 && (
                  <span className="text-[10px] text-zinc-500">
                    ${stage.valueAmount.toLocaleString('es-VE')}
                  </span>
                )}
                <span className="font-bold text-white">{stage.count}</span>
              </div>
            </div>

            {/* Barra escalonada estilo Monocharts */}
            <div className="h-1.5 w-full bg-zinc-950 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-700 ${
                  stage.colorAccent
                    ? ''
                    : isFirst
                    ? 'bg-zinc-600'
                    : isLast
                    ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                    : 'bg-zinc-400'
                }`}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: stage.colorAccent,
                }}
              />
            </div>

            {/* Tasa de transición si no es la primera fase */}
            {!isFirst && stage.conversionRate !== undefined && (
              <div className="flex justify-end text-[10px] text-zinc-500">
                {stage.conversionRate !== null ? (
                  <span className="text-zinc-400 font-medium">
                    <strong className="text-white font-bold">{stage.conversionRate.toFixed(0)}%</strong> de avance desde etapa previa
                  </span>
                ) : (
                  <span className="text-zinc-600">sin suficientes datos</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Gráfico de Barras Doble Monocromático para Flujo de Caja:
 * Comparativa entre cobrado (barra sólida) y pendiente (borde punteado/degradado).
 */
export function MonoCashflowBarChart({
  points,
  height = 160,
}: {
  points: { monthName: string; paid: number; pending: number }[]
  height?: number
}) {
  const currency = new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="monthName"
            tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#27272a' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#52525b', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <Tooltip
            content={
              <MonoTooltip
                formatter={(v) => currency.format(v)}
              />
            }
          />
          <Bar
            dataKey="paid"
            name="Cobrado"
            fill="#ffffff"
            radius={[2, 2, 0, 0]}
            isAnimationActive={true}
          />
          <Bar
            dataKey="pending"
            name="Por Cobrar"
            fill="#52525b"
            radius={[2, 2, 0, 0]}
            isAnimationActive={true}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
