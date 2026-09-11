import Link from 'next/link'
import { ArrowRight, TrendingUp, Wallet } from 'lucide-react'
import type { MonthlyCashflowPoint } from './types'
import { MonoCashflowBarChart } from '@/components/workspace/monocharts'
import { Button } from '@/components/ui/button'
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'

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
    <DashboardCard className="gap-0">
      <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
            <Wallet className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Flujo de Caja · 6 Meses</CardTitle>
            <CardDescription className="text-xs">
              Cobrado por fecha de pago vs. pendiente acordado
            </CardDescription>
          </div>
        </div>

        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
          <Link href="/workspace/billing" className="flex items-center gap-1">
            <span>Facturación</span>
            <ArrowRight className="size-3" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {hasData ? (
          <MonoCashflowBarChart points={points} height={160} />
        ) : (
          <div className="h-40 flex items-center justify-center text-center">
            <div className="space-y-1.5">
              <TrendingUp className="size-6 text-muted-foreground mx-auto" />
              <p className="text-xs font-medium text-foreground">
                Aún no hay cobros registrados.
              </p>
              <p className="text-xs text-muted-foreground">
                Registra tu primer cobro en Facturación para ver el flujo de caja.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t py-3 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs bg-muted/20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full bg-sky-400 inline-block" />
            <span>Cobrado</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full border border-amber-400/80 bg-amber-400/20 inline-block" />
            <span>Pendiente</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Cobrado: <strong className="text-foreground font-semibold tabular-nums">{currency.format(totalPaid)}</strong>
          </span>
          <span className="text-muted-foreground">
            Por cobrar: <strong className="text-amber-500 font-semibold tabular-nums">{currency.format(totalPending)}</strong>
          </span>
        </div>
      </CardFooter>
    </DashboardCard>
  )
}
