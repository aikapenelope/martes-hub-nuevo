import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { SegmentedBarChart } from '@/components/workspace/charts/SegmentedBarChart'
import type { WeeklyCashflow } from '@/lib/trend-widgets'
import { DashboardCard } from '@/components/dashboard-card'
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Card grande de cobranza del Resumen (entre TrendStrip y Acciones rápidas):
 * chart segmentado de 8 semanas (blanco = cobrado, gris = pendiente) con
 * leyenda de dos series y totales, siguiendo la estructura de
 * CockpitCashflowChart (cobrado por fecha de pago · pendiente por vencimiento).
 */

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function WeeklyCashflowCard({ data }: { data: WeeklyCashflow }) {
  const totalCobrado = data.cobrado.reduce((acc, v) => acc + v, 0)
  const totalPendiente = data.pendiente.reduce((acc, v) => acc + v, 0)
  const hasData = totalCobrado > 0 || totalPendiente > 0

  return (
    <DashboardCard className="relative gap-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <div>
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Cobranza · 8 semanas
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground">
            Cobrado por fecha de pago · Pendiente por fecha acordada
          </CardDescription>
        </div>
        <Link
          href="/workspace/billing"
          className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
        >
          Facturación <ArrowRight className="size-3" />
        </Link>
      </CardHeader>

      <CardContent className="pt-4">
        {hasData ? (
          <div>
            <SegmentedBarChart {...data} />
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center text-center">
            <p className="font-mono text-[11px] text-muted-foreground">
              Sin cobros ni vencimientos registrados en las últimas 8 semanas.
            </p>
          </div>
        )}
      </CardContent>

      {hasData && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[11px] font-mono">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-white" /> Cobrado
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-zinc-600" /> Pendiente
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground">{currency.format(totalCobrado)}</span>
            <span className="text-muted-foreground">Pendiente: {currency.format(totalPendiente)}</span>
          </div>
        </CardFooter>
      )}
    </DashboardCard>
  )
}
