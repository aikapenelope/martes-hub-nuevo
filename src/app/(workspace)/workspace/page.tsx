/**
 * WorkspacePage — Torre de Control Comercial (Deep OLED).
 *
 * Arquitectura modular y reactiva con datos agregados en tiempo real:
 * - CockpitCommandStrip: Estado operativo y accesos directos rápidos.
 * - CockpitKpiGrid: 5 tarjetas de métricas comerciales y salud del canal.
 * - ActivityHeatmap: Matriz anual interactiva de 364 días (actividades + mensajes + pagos).
 * - CockpitConversionFunnel: Embudo de conversión real entre etapas de leads y clientes.
 * - CockpitPipelinePriorities: Prioridades de leads con actividad reciente.
 * - CockpitOmnichannelFeed: Feed consolidado omnicanal (WhatsApp, IA, Email, Cobros).
 */

import 'server-only'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { CockpitCommandStrip } from '@/components/workspace/overview/CockpitCommandStrip'
import { CockpitKpiGrid } from '@/components/workspace/overview/CockpitKpiGrid'
import { CockpitConversionFunnel } from '@/components/workspace/overview/CockpitConversionFunnel'
import { CockpitPipelinePriorities } from '@/components/workspace/overview/CockpitPipelinePriorities'
import { CockpitOmnichannelFeed } from '@/components/workspace/overview/CockpitOmnichannelFeed'

export default async function WorkspacePage() {
  const { payload, tenant, tenantId, user } = await getWorkspaceContext()
  const data = await getWorkspaceOverviewData({ payload, user, tenantId })

  return (
    <div className="space-y-4">
      <CockpitCommandStrip tenant={tenant} dateTitle={data.dateTitle} />

      <CockpitKpiGrid metrics={data.metrics} />

      <ActivityHeatmap daysData={data.dayBuckets} totalInteractions={data.totalYearInteractions} />

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        <CockpitConversionFunnel metrics={data.metrics} />
        <CockpitPipelinePriorities hotLeads={data.hotLeads} />
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
