import Link from 'next/link'
import { Layers } from 'lucide-react'
import type { WorkspaceOverviewMetrics } from './types'
import { MonoFunnel, type FunnelStage } from '@/components/workspace/monocharts'

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

  const stages: FunnelStage[] = [
    {
      label: 'Nuevos / Inbound',
      count: leadsNuevoCount,
      valueAmount: estimatedRevenueNew,
      colorAccent: '#71717a', // zinc-500
    },
    {
      label: 'En Conversación',
      count: leadsContactadoCount,
      valueAmount: estimatedRevenueContacted,
      conversionRate: rateNewToContacted,
      colorAccent: '#38bdf8', // sky-400
    },
    {
      label: 'Calificados',
      count: leadsCalificadoCount,
      valueAmount: estimatedRevenueQualified,
      conversionRate: rateContactedToQualified,
      colorAccent: '#818cf8', // indigo-400
    },
    {
      label: 'Cotización / Por Cobrar',
      count: revenuePendingCount,
      valueAmount: revenuePendingTotal,
      colorAccent: '#fbbf24', // amber-400
    },
    {
      label: 'Cerrado Ganado (Activos)',
      count: totalConvertedClients,
      conversionRate: rateQualifiedToWon,
      colorAccent: '#ffffff', // white glow
    },
  ]

  return (
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400" /> Embudo de Conversión
          </h2>
          <p className="text-[11px] text-zinc-500">Volumen y tasa de avance real entre etapas</p>
        </div>
        <div className="flex items-center gap-3">
          {globalConversionRate !== null && (
            <span className="text-[11px] font-mono text-zinc-400 border border-zinc-800 px-2 py-0.5">
              Global: <strong className="text-white">{globalConversionRate.toFixed(1)}%</strong>
            </span>
          )}
          <Link href="/workspace/crm" className="text-xs font-mono text-sky-400 hover:underline flex items-center gap-1 font-bold">
            Pipeline →
          </Link>
        </div>
      </div>

      <MonoFunnel stages={stages} />
    </div>
  )
}

