import Link from 'next/link'

import { OledCard } from '@/components/workspace/oled'
import { SegmentedBarChart } from '@/components/workspace/charts/SegmentedBarChart'
import type { WeeklyCashflow } from '@/lib/trend-widgets'

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
    <OledCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Cobranza · 8 semanas</p>
        <Link href="/workspace/billing" className="text-[11px] font-mono text-cyan-400 hover:underline">
          Facturación →
        </Link>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">Cobrado por fecha de pago · Pendiente por fecha acordada</p>

      {hasData ? (
        <>
          <div className="mt-3">
            <SegmentedBarChart {...data} />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-[11px] font-mono">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" /> Cobrado
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-600" /> Pendiente
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-foreground">{currency.format(totalCobrado)}</span>
              <span className="text-muted-foreground">Pendiente: {currency.format(totalPendiente)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 flex h-36 items-center justify-center text-center">
          <p className="font-mono text-[11px] text-muted-foreground">
            Sin cobros ni vencimientos registrados en las últimas 8 semanas.
          </p>
        </div>
      )}
    </OledCard>
  )
}
