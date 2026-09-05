import Link from 'next/link'
import { TrendingUp, Wallet } from 'lucide-react'
import type { MonthlyCashflowPoint } from './types'
import { MonoCashflowBarChart } from '@/components/workspace/monocharts'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

interface CockpitCashflowChartProps {
  points: MonthlyCashflowPoint[]
}

/**
 * Flujo de caja de 6 meses: comparativa visual monocromática interactiva
 * entre cobrado y por cobrar con Recharts y tooltips enriquecidos.
 */
export function CockpitCashflowChart({ points }: CockpitCashflowChartProps) {
  const totalPaid = points.reduce((acc, p) => acc + p.paid, 0)
  const totalPending = points.reduce((acc, p) => acc + p.pending, 0)
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
        <div className="pt-2">
          <MonoCashflowBarChart points={points} height={160} />
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
