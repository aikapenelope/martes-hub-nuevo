import Link from 'next/link'
import { TrendingUp, Wallet } from 'lucide-react'
import type { MonthlyCashflowPoint } from './types'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const compact = new Intl.NumberFormat('es-VE', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

interface CockpitCashflowChartProps {
  points: MonthlyCashflowPoint[]
}

/**
 * Flujo de caja de 6 meses: barras cobradas (sólidas) vs pendientes (huecas),
 * por paid_at y due_date respectivamente. Server component con barras CSS —
 * mismo patrón que el resto del cockpit (sin cliente, sin librería de charts).
 */
export function CockpitCashflowChart({ points }: CockpitCashflowChartProps) {
  const totalPaid = points.reduce((acc, p) => acc + p.paid, 0)
  const totalPending = points.reduce((acc, p) => acc + p.pending, 0)
  const max = Math.max(...points.map((p) => Math.max(p.paid, p.pending)), 1)
  const hasData = totalPaid > 0 || totalPending > 0

  return (
    <div className="p-4 oled-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5 text-cyan-400" /> Flujo de Caja · 6 Meses
          </h2>
          <p className="text-[11px] text-zinc-500">
            Cobrado por fecha de pago · Pendiente por fecha acordada de cobro
          </p>
        </div>
        <Link
          href="/workspace/billing"
          className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1 font-bold"
        >
          Facturación →
        </Link>
      </div>

      {hasData ? (
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-40 px-1">
          {points.map((point) => {
            const paidPct = (point.paid / max) * 100
            const pendingPct = (point.pending / max) * 100
            const isCurrent = point === points[points.length - 1]
            return (
              <div key={point.monthName + point.paid} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="flex items-end justify-center gap-1 w-full h-full">
                  {/* Cobrado */}
                  <div
                    className="w-4 sm:w-6 rounded-t-sm bg-gradient-to-t from-sky-600 to-sky-400 min-h-[2px] transition-all duration-500"
                    style={{ height: `${Math.max(paidPct, point.paid > 0 ? 2 : 0)}%` }}
                    title={`Cobrado: ${currency.format(point.paid)}`}
                  />
                  {/* Pendiente */}
                  <div
                    className="w-4 sm:w-6 rounded-t-sm border border-dashed border-amber-400/70 bg-amber-400/10 min-h-[2px] transition-all duration-500"
                    style={{ height: `${Math.max(pendingPct, point.pending > 0 ? 2 : 0)}%` }}
                    title={`Pendiente: ${currency.format(point.pending)}`}
                  />
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">{compact.format(point.paid)}</span>
                  <span
                    className={`text-[10px] font-mono uppercase font-bold ${isCurrent ? 'text-sky-400' : 'text-zinc-500'}`}
                  >
                    {point.monthName}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center text-center">
          <div className="space-y-1.5">
            <TrendingUp className="w-6 h-6 text-zinc-700 mx-auto" />
            <p className="text-zinc-500 font-mono text-xs">
              Aún no hay cobros registrados.
            </p>
            <p className="text-zinc-600 font-mono text-[11px]">
              Registra tu primer cobro en Facturación para ver el flujo de caja.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-zinc-800 font-mono text-[11px]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-3 h-2 rounded-t-sm bg-gradient-to-t from-sky-600 to-sky-400 inline-block" />
            Cobrado
          </span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-3 h-2 rounded-t-sm border border-dashed border-amber-400/70 bg-amber-400/10 inline-block" />
            Pendiente
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sky-400 font-bold">
            Cobrado: {currency.format(totalPaid)}
          </span>
          <span className="text-amber-400 font-bold">
            Por cobrar: {currency.format(totalPending)}
          </span>
        </div>
      </div>
    </div>
  )
}
