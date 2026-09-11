import 'server-only'

import Link from 'next/link'
import { MessageSquare, Mail, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { DashboardStats } from '@/components/stats'
import { NetRevenueChart } from '@/components/net-revenue-chart'
import { ChannelSalesChart } from '@/components/channel-sales-chart'
import { DashboardInvoices } from '@/components/dashboard-invoices'
import { BillingHealth } from '@/components/billing-health'
import { DashboardActivity } from '@/components/dashboard-activity'
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
  const statsItems = [
    {
      label: 'Ingresos del período',
      value: usd.format(data.metrics.revenuePeriodTotal),
      delta: data.metrics.revenueTrendPct ?? 0,
      comparisonLabel: 'vs período anterior',
    },
    {
      label: 'Leads activos',
      value: String(data.metrics.totalLeadsActive),
      delta: data.metrics.leadsNuevosTrendPct ?? 0,
      comparisonLabel: `${data.metrics.leadsCreatedInPeriod} captados`,
    },
    {
      label: 'Tasa de conversión',
      value: `${(data.metrics.globalConversionRate ?? 0).toFixed(1)}%`,
      delta: data.metrics.conversionTrendPct ?? 0,
      comparisonLabel: `${data.metrics.totalConvertedClients} convertidos`,
    },
    {
      label: 'Cobros pendientes',
      value: usd.format(data.metrics.revenuePendingTotal),
      delta: data.metrics.overduePaymentsCount > 0 ? -data.metrics.overduePaymentsCount : 0,
      comparisonLabel: `${data.metrics.overduePaymentsCount} vencidos`,
    },
  ]

  // Fila 2: Gráfico de ingresos reales + Ventas por canal
  const revenueChartData = (data.cashflowPoints || []).map((pt) => ({
    day: pt.monthName,
    sales: pt.paid,
  }))

  const channelSalesRows = (data.dayBuckets || []).slice(-7).map((d) => ({
    date: d.dateStr,
    retail: Math.round(d.count * 0.65),
    online: Math.round(d.count * 0.35),
  }))

  // Fila 3: Cobros recientes, salud de facturación y feed de actividades
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

  const recentActivities = [
    ...(data.recentSummaries || []).map((s) => ({
      title: s.summary ? s.summary.slice(0, 50) + '…' : 'Resumen IA de conversación',
      time: 'Reciente',
      icon: <Sparkles className="size-4 text-primary" />,
    })),
    ...(data.recentConversations || []).map((c) => {
      const contact =
        c.client && typeof c.client === 'object' && 'name' in c.client
          ? c.client.name
          : c.lead && typeof c.lead === 'object' && 'fullName' in c.lead
            ? c.lead.fullName
            : c.contactAddress || 'Contacto'
      return {
        title: `Chat ${c.channel === 'instagram_dm' ? 'Instagram' : 'WhatsApp'} con ${contact}`,
        time: c.lastMessageAt
          ? new Intl.DateTimeFormat('es-VE', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Caracas',
            }).format(new Date(c.lastMessageAt))
          : 'Reciente',
        icon: <MessageSquare className="size-4 text-emerald-500" />,
      }
    }),
    ...(data.recentEmails || []).map((e) => ({
      title: `Email a ${e.to}: ${e.subject || 'Notificación'}`,
      time: 'Reciente',
      icon: <Mail className="size-4 text-sky-500" />,
    })),
  ].slice(0, 6)

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

      {/* Cuadrícula Bento Maestra de Efferd (@efferd/dashboard-2) */}
      <div className="grid grid-cols-1 gap-px bg-border p-px md:grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden">
        {/* Fila 1: 4 KPIs (1 columna cada uno) */}
        <DashboardStats items={statsItems} />

        {/* Fila 2: 2 Gráficos principales (2 columnas cada uno) */}
        <NetRevenueChart data={revenueChartData.length > 0 ? revenueChartData : undefined} />
        <ChannelSalesChart data={channelSalesRows.length > 0 ? channelSalesRows : undefined} />

        {/* Fila 3: Cobros (2 cols) + Salud de cobranza (1 col) + Actividad (1 col) */}
        <DashboardInvoices invoices={recentInvoices.length > 0 ? recentInvoices : undefined} />
        <BillingHealth
          overdueCount={data.metrics.overduePaymentsCount}
          overdueTotal={usd.format(data.metrics.revenuePendingTotal)}
        />
        <DashboardActivity items={recentActivities.length > 0 ? recentActivities : undefined} />
      </div>
    </div>
  )
}

