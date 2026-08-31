/**
 * WorkspacePage — Torre de Control Comercial (Deep OLED).
 *
 * Arquitectura modular y reactiva con datos agregados en tiempo real:
 * - CockpitCommandStrip: Estado operativo y accesos directos rápidos.
 * - CockpitAlertStrip: Alertas operativas proactivas (SLA Meta 24h, cobros y tareas).
 * - CockpitKpiGrid: 5 tarjetas de métricas comerciales y salud del canal.
 * - ActivityHeatmap: Matriz anual interactiva de 364 días (actividades + mensajes + pagos).
 * - CockpitCashflowChart: Flujo de caja de 6 meses (cobrado por paid_at + pendiente por due_date).
 * - CockpitConversionFunnel: Embudo de conversión real entre etapas de leads y clientes.
 * - CockpitSourceBreakdown: Desglose de canales de captación (Google Maps, WhatsApp, etc.).
 * - CockpitPipelinePriorities: Prioridades de leads con actividad reciente.
 * - CockpitOmnichannelFeed: Feed consolidado omnicanal (WhatsApp, IA, Email, Cobros).
 */

import 'server-only'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { CockpitCommandStrip } from '@/components/workspace/overview/CockpitCommandStrip'
import { CockpitAlertStrip } from '@/components/workspace/overview/CockpitAlertStrip'
import { CockpitKpiGrid } from '@/components/workspace/overview/CockpitKpiGrid'
import { CockpitCashflowChart } from '@/components/workspace/overview/CockpitCashflowChart'
import { CockpitConversionFunnel } from '@/components/workspace/overview/CockpitConversionFunnel'
import { CockpitSourceBreakdown } from '@/components/workspace/overview/CockpitSourceBreakdown'
import { CockpitPipelinePriorities } from '@/components/workspace/overview/CockpitPipelinePriorities'
import { CockpitOmnichannelFeed } from '@/components/workspace/overview/CockpitOmnichannelFeed'

export default async function WorkspacePage() {
  const { payload, tenant, tenantId, user } = await getWorkspaceContext()
  const data = await getWorkspaceOverviewData({ payload, user, tenantId })

  return (
    <div className="space-y-4">
      <CockpitCommandStrip tenant={tenant} dateTitle={data.dateTitle} />

      <CockpitAlertStrip alerts={data.operationalAlerts} />

      <CockpitKpiGrid metrics={data.metrics} />

      <ActivityHeatmap daysData={data.dayBuckets} totalInteractions={data.totalYearInteractions} />

      <CockpitCashflowChart points={data.cashflowPoints} />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        <CockpitConversionFunnel metrics={data.metrics} />
        <div className="lg:col-span-4 space-y-3.5">
          <CockpitSourceBreakdown sources={data.sourceBreakdown} />
          <CockpitPipelinePriorities hotLeads={data.hotLeads} />
        </div>
        <CockpitOmnichannelFeed
          conversations={data.recentConversations}
          summaries={data.recentSummaries}
          emails={data.recentEmails}
          payments={data.recentPayments}
          nowTime={data.nowTime}
        />
      </section>
    </div>
  )
}
