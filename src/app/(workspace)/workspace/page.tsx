import 'server-only'

import Link from 'next/link'
import { MessageSquare, Mail, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { DashboardStats, type StatItem } from '@/components/stats'
import { NetRevenueChart } from '@/components/net-revenue-chart'
import { ChannelSalesChart } from '@/components/channel-sales-chart'
import { DashboardInvoices } from '@/components/dashboard-invoices'
import { BillingHealth } from '@/components/billing-health'
import { DashboardActivity } from '@/components/dashboard-activity'
import { CockpitAlertStrip } from '@/components/workspace/overview/CockpitAlertStrip'
import { CockpitConversionFunnel } from '@/components/workspace/overview/CockpitConversionFunnel'
import { CockpitSourceBreakdown } from '@/components/workspace/overview/CockpitSourceBreakdown'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { CockpitFollowupsToday } from '@/components/workspace/overview/CockpitFollowupsToday'
import type { TimeRangeKey } from '@/components/workspace/overview/types'

const VALID_RANGES: TimeRangeKey[] = ['hoy', '7d', '30d', '90d', 'ano']
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ rango?: string }>
}) {
  const [{ payload, tenant, tenantId, user }, queryParams] = await Promise.all([
    getWorkspaceContext(),
    searchParams ? searchParams : Promise.resolve({ rango: undefined }),
  ])

  const timeRange: TimeRangeKey =
    queryParams?.rango && VALID_RANGES.includes(queryParams.rango as TimeRangeKey)
      ? (queryParams.rango as TimeRangeKey)
      : '30d'

  const data = await getWorkspaceOverviewData({ payload, user, tenant, tenantId, timeRange })

  const RANGES: { key: TimeRangeKey; label: string }[] = [
    { key: 'hoy', label: 'Hoy' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'ano', label: '1A' },
  ]

  // Fila 1: 4 KPIs de Efferd conectados a métricas reales
  const statsItems: StatItem[] = [
    {
      label: 'Ingresos del período',
      value: usd.format(data.metrics.revenuePeriodTotal),
      delta: data.metrics.revenueTrendPct,
      comparisonLabel: data.metrics.revenueTrendPct === null ? 'sin base previa' : 'vs período anterior',
    },
    {
      label: 'Leads activos',
      value: String(data.metrics.totalLeadsActive),
      delta: data.metrics.leadsNuevosTrendPct,
      comparisonLabel: `${data.metrics.leadsCreatedInPeriod} captados`,
    },
    {
      label: 'Tasa de conversión',
      value: data.metrics.globalConversionRate !== null ? `${data.metrics.globalConversionRate.toFixed(1)}%` : '—',
      delta: data.metrics.conversionTrendPct,
      comparisonLabel: `${data.metrics.totalConvertedClients} convertidos`,
    },
    {
      label: 'Cobros pendientes',
      value: usd.format(data.metrics.revenuePendingTotal),
      delta: data.metrics.overduePaymentsCount > 0 ? -data.metrics.overduePaymentsCount : 0,
      comparisonLabel: `${data.metrics.overduePaymentsCount} vencidos`,
    },
  ]

  // Fila 2: Gráfico de ingresos reales + Actividad operativa diaria (dayBuckets reales)
  const revenueChartData = (data.cashflowPoints || []).map((pt) => ({
    day: pt.monthName,
    sales: pt.paid,
  }))

  const dailyActivityRows = (data.dayBuckets || []).slice(-7).map((d) => ({
    date: d.dateStr,
    interactions: d.count,
  }))

  // Fila 3: Cobros recientes, salud de facturación y feed de actividades omnicanal
  const recentInvoices = (data.recentPayments || []).slice(0, 5).map((p) => {
    const customerName =
      p.client && typeof p.client === 'object' && 'name' in p.client ? p.client.name : 'Cliente'
    return {
      id: String(p.id),
      customer: customerName,
      amount: usd.format(p.amount ?? 0),
      status: p.status === 'pagado' ? 'Paid' : p.status === 'pendiente' ? 'Pending' : 'Overdue',
    }
  })

  const dtFormatter = new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  })

  const recentActivities = [
    ...(data.recentSummaries || []).map((s) => ({
      timestamp: new Date(s.createdAt).getTime(),
      title: s.summary ? s.summary.slice(0, 50) + '…' : 'Resumen IA de conversación',
      time: s.createdAt ? dtFormatter.format(new Date(s.createdAt)) : 'Reciente',
      icon: <Sparkles className="size-4 text-primary" />,
    })),
    ...(data.recentConversations || []).map((c) => {
      const contact =
        c.client && typeof c.client === 'object' && 'name' in c.client
          ? c.client.name
          : c.lead && typeof c.lead === 'object' && 'fullName' in c.lead
            ? c.lead.fullName
            : c.contactAddress || 'Contacto'
      const ts = c.lastMessageAt || c.updatedAt || c.createdAt
      return {
        timestamp: new Date(ts).getTime(),
        title: `Chat ${c.channel === 'instagram_dm' ? 'Instagram' : 'WhatsApp'} con ${contact}`,
        time: ts ? dtFormatter.format(new Date(ts)) : 'Reciente',
        icon: <MessageSquare className="size-4 text-emerald-500" />,
      }
    }),
    ...(data.recentEmails || []).map((e) => ({
      timestamp: new Date(e.createdAt).getTime(),
      title: `Email a ${e.to}: ${e.subject || 'Notificación'}`,
      time: e.createdAt ? dtFormatter.format(new Date(e.createdAt)) : 'Reciente',
      icon: <Mail className="size-4 text-sky-500" />,
    })),
  ]
    .filter((a) => !Number.isNaN(a.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Cabecera unificada con selector de período */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Torre de Control
          </h1>
          <p className="text-xs text-muted-foreground">
            {tenant.name} · Panorama operativo en tiempo real
          </p>
        </div>
        <nav
          aria-label="Rango de tiempo"
          className="inline-flex items-center rounded-lg border border-border/40 bg-muted/60 p-1"
        >
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/workspace?rango=${r.key}`}
              aria-current={timeRange === r.key ? 'true' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                timeRange === r.key
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Alertas operativas críticas proactivas (SLA Meta 24h, cobros y tareas) */}
      {data.operationalAlerts.length > 0 && (
        <CockpitAlertStrip alerts={data.operationalAlerts} />
      )}

      {/* Cuadrícula Bento Maestra de Efferd (@efferd/dashboard-2) */}
      <div className="grid grid-cols-1 gap-px bg-border p-px md:grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden">
        {/* Fila 1: 4 KPIs de Efferd (1 columna cada uno) */}
        <DashboardStats items={statsItems} />

        {/* Fila 2: 2 Gráficos principales (2 columnas cada uno) */}
        <NetRevenueChart data={revenueChartData} />
        <ChannelSalesChart
          data={dailyActivityRows}
          title="Actividad Operativa"
          description="Volumen diario de interacciones (mensajes, tareas y pagos)"
        />

        {/* Fila 3: Embudo de Conversión (2 cols) + Canales de Captación (2 cols) */}
        <CockpitConversionFunnel metrics={data.metrics} className="col-span-1 md:col-span-2 lg:col-span-2" />
        <CockpitSourceBreakdown sources={data.sourceBreakdown} className="col-span-1 md:col-span-2 lg:col-span-2" />

        {/* Fila 4: Matriz Anual de Actividad Comercial (Ancho completo 4 cols) */}
        <ActivityHeatmap
          daysData={data.dayBuckets}
          hourBuckets={data.hourBuckets}
          totalInteractions={data.totalYearInteractions}
          className="col-span-1 md:col-span-2 lg:col-span-4"
        />

        {/* Fila 5: Seguimientos de Hoy con contacto directo (2 cols) + Cobros recientes (2 cols) */}
        <CockpitFollowupsToday items={data.followupsToday} className="col-span-1 md:col-span-2 lg:col-span-2" />
        <DashboardInvoices invoices={recentInvoices} className="col-span-1 md:col-span-2 lg:col-span-2" />

        {/* Fila 6: Salud de cobranza (2 cols) + Feed de actividad omnicanal (2 cols) */}
        <BillingHealth
          overdueCount={data.metrics.overduePaymentsCount}
          overdueTotal={usd.format(data.metrics.overduePaymentsTotal)}
          pendingCount={data.metrics.revenuePendingCount}
          pendingTotal={usd.format(data.metrics.revenuePendingTotal)}
          className="col-span-1 md:col-span-2 lg:col-span-2"
        />
        <DashboardActivity items={recentActivities} className="col-span-1 md:col-span-2 lg:col-span-2" />
      </div>
    </div>
  )
}

