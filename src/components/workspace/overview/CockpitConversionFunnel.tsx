import Link from 'next/link'
import { Layers } from 'lucide-react'
import type { WorkspaceOverviewMetrics } from './types'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function CockpitConversionFunnel({ metrics }: { metrics: WorkspaceOverviewMetrics }) {
  const {
    leadsNuevoCount,
    leadsContactadoCount,
    leadsCalificadoCount,
    estimatedRevenueNew,
    estimatedRevenueContacted,
    estimatedRevenueQualified,
    revenuePendingTotal,
    revenuePendingCount,
    totalConvertedClients,
    rateNewToContacted,
    rateContactedToQualified,
    rateQualifiedToWon,
    globalConversionRate,
  } = metrics

  return (
    <div className="lg:col-span-4 p-4 oled-card space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400" /> Embudo de Conversión
          </h2>
          <p className="text-[11px] text-zinc-500">Volumen y tasa de avance real entre etapas</p>
        </div>
        <Link href="/workspace/crm" className="text-xs font-mono text-sky-400 hover:underline flex items-center gap-1 font-bold">
          Pipeline →
        </Link>
      </div>

      <div className="space-y-2.5 font-mono text-xs">
        {/* 1. Nuevos */}
        <div className="p-3 oled-subcard space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-white">1. Nuevos / Inbound</span>
            <span className="text-zinc-400 font-semibold">
              {leadsNuevoCount} leads · {currency.format(estimatedRevenueNew)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-900 overflow-hidden">
            <div className="h-full bg-zinc-400" style={{ width: '100%' }} />
          </div>
          <div className="flex justify-end text-[11px] text-zinc-500">
            <span className="text-sky-400 font-bold">
              {rateNewToContacted !== null ? `${rateNewToContacted.toFixed(0)}% avanza a contactado` : 'sin datos aún'}
            </span>
          </div>
        </div>

        {/* 2. En conversación */}
        <div className="p-3 oled-subcard space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-sky-400">2. En Conversación</span>
            <span className="text-sky-400 font-semibold">
              {leadsContactadoCount} leads · {currency.format(estimatedRevenueContacted)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-900 overflow-hidden">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${Math.min(100, (leadsContactadoCount / Math.max(leadsNuevoCount, 1)) * 100)}%` }}
            />
          </div>
          <div className="flex justify-end text-[11px] text-zinc-500">
            <span className="text-sky-400 font-bold">
              {rateContactedToQualified !== null ? `${rateContactedToQualified.toFixed(0)}% avanza a calificado` : 'sin datos aún'}
            </span>
          </div>
        </div>

        {/* 3. Calificados */}
        <div className="p-3 oled-subcard space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-indigo-400">3. Calificados</span>
            <span className="text-indigo-400 font-semibold">
              {leadsCalificadoCount} leads · {currency.format(estimatedRevenueQualified)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-900 overflow-hidden">
            <div
              className="h-full bg-indigo-400"
              style={{ width: `${Math.min(100, (leadsCalificadoCount / Math.max(leadsContactadoCount, 1)) * 100)}%` }}
            />
          </div>
          <div className="flex justify-end text-[11px] text-zinc-500">
            <span className="text-indigo-400 font-bold">
              {rateQualifiedToWon !== null ? `${rateQualifiedToWon.toFixed(0)}% cierra como cliente` : 'sin datos aún'}
            </span>
          </div>
        </div>

        {/* 4. Cotización / Cobro Pendiente */}
        <div className="p-3 oled-subcard space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-amber-400">4. Cotización / Cobro Pendiente</span>
            <span className="text-amber-400 font-semibold">
              {revenuePendingCount} pendiente{revenuePendingCount !== 1 ? 's' : ''} · {currency.format(revenuePendingTotal)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-900 overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: '100%' }} />
          </div>
        </div>

        {/* 5. Cerrado Ganado */}
        <div className="p-3 oled-subcard space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-bold text-cyan-400">5. Cerrado Ganado (clientes activos)</span>
            <span className="text-cyan-400 font-semibold">{totalConvertedClients} clientes</span>
          </div>
          <div className="h-1.5 bg-zinc-900 overflow-hidden">
            <div
              className="h-full bg-cyan-400"
              style={{ width: `${Math.min(100, globalConversionRate ?? 0)}%` }}
            />
          </div>
          <div className="flex justify-end text-[11px] text-zinc-500">
            <span className="text-cyan-400 font-bold">
              Global: {globalConversionRate !== null ? `${globalConversionRate.toFixed(1)}%` : 'sin datos aún'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
