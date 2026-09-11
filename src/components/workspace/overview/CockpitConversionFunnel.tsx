import Link from 'next/link'
import { ArrowRight, Layers } from 'lucide-react'
import type { WorkspaceOverviewMetrics } from './types'
import { MonoFunnel, type FunnelStage } from '@/components/workspace/monocharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'
import { cn } from '@/lib/utils'

export function CockpitConversionFunnel({
  metrics,
  className,
}: {
  metrics: WorkspaceOverviewMetrics
  className?: string
}) {
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
    globalConversionRate,
  } = metrics

  const stages: FunnelStage[] = [
    {
      label: 'Nuevos / Inbound',
      count: leadsNuevoCount,
      valueAmount: estimatedRevenueNew,
      colorAccent: '#71717a', // neutro base
    },
    {
      label: 'En Conversación',
      count: leadsContactadoCount,
      valueAmount: estimatedRevenueContacted,
      colorAccent: '#38bdf8', // sky-400
    },
    {
      label: 'Calificados',
      count: leadsCalificadoCount,
      valueAmount: estimatedRevenueQualified,
      colorAccent: '#818cf8', // indigo-400
    },
    {
      label: 'Cotización / Por Cobrar',
      count: revenuePendingCount,
      valueAmount: revenuePendingTotal,
      colorAccent: '#fbbf24', // amber-400
    },
    {
      label: 'Cerrado Ganado',
      count: totalConvertedClients,
      colorAccent: '#ffffff', // white glow
    },
  ]

  return (
    <DashboardCard className={cn('col-span-1 md:col-span-2 lg:col-span-2 gap-0', className)}>
      <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-400">
            <Layers className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Distribución del Pipeline</CardTitle>
            <CardDescription className="text-xs">Volumen estimado y conteo activo por etapa comercial</CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {globalConversionRate !== null && (
            <Badge variant="outline" className="text-xs font-medium">
              Conv. Global: <strong className="ml-1 text-foreground font-semibold">{globalConversionRate.toFixed(1)}%</strong>
            </Badge>
          )}
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
            <Link href="/workspace/crm" className="flex items-center gap-1">
              <span>Pipeline</span>
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <MonoFunnel stages={stages} />
      </CardContent>
    </DashboardCard>
  )
}

