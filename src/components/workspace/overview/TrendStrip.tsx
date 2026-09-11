import type { MonthlySeries } from '@/lib/trend-widgets'
import { DashboardCard } from '@/components/dashboard-card'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Delta, DeltaIcon, DeltaValue } from '@/components/delta'

/**
 * Mini-sparklines del Resumen (estilo dashboard, dentro del sistema OLED):
 * 3 series de 6 meses en SVG puro — sin librería de charts.
 */

const MES_LABEL: Record<string, string> = {
  '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic',
}

function SparkBars({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-full rounded-[2px] ${i === values.length - 1 ? accent : 'bg-muted/80'}`}
          style={{ height: `${Math.max(6, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  )
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

export function TrendStrip({ trends }: { trends: MonthlySeries }) {
  const monthLabels = trends.months.map((m) => MES_LABEL[m.slice(5)] ?? m.slice(5))

  return (
    <section className="grid grid-cols-1 gap-px bg-border p-px sm:grid-cols-3" aria-label="Tendencias de 6 meses">
      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Cobrado · 6 meses
          </CardTitle>
          {trends.cobradoDeltaPct !== null && (
            <Delta value={trends.cobradoDeltaPct} variant="badge">
              <DeltaIcon variant="trend" />
              <DeltaValue />
            </Delta>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {fmtMoney(trends.cobrado[5] ?? 0)}{' '}
            <span className="text-xs font-normal text-muted-foreground font-sans">este mes</span>
          </p>
          <div className="mt-1">
            <SparkBars values={trends.cobrado} accent="bg-emerald-400" />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
            {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </CardContent>
      </DashboardCard>

      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Leads nuevos · 6 meses
          </CardTitle>
          {trends.leadsNuevosDeltaPct !== null && (
            <Delta value={trends.leadsNuevosDeltaPct} variant="badge">
              <DeltaIcon variant="trend" />
              <DeltaValue />
            </Delta>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {trends.leadsNuevos[5] ?? 0}{' '}
            <span className="text-xs font-normal text-muted-foreground font-sans">este mes</span>
          </p>
          <div className="mt-1">
            <SparkBars values={trends.leadsNuevos} accent="bg-sky-400" />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
            {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </CardContent>
      </DashboardCard>

      <DashboardCard className="gap-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-normal">
            Actividades · 6 meses
          </CardTitle>
          {trends.actividadesDeltaPct !== null && (
            <Delta value={trends.actividadesDeltaPct} variant="badge">
              <DeltaIcon variant="trend" />
              <DeltaValue />
            </Delta>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {trends.actividades[5] ?? 0}{' '}
            <span className="text-xs font-normal text-muted-foreground font-sans">este mes</span>
          </p>
          <div className="mt-1">
            <SparkBars values={trends.actividades} accent="bg-amber-400" />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
            {monthLabels.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </CardContent>
      </DashboardCard>
    </section>
  )
}
