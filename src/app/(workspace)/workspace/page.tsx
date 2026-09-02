/**
 * WorkspacePage — Torre de Control Comercial (Deep OLED).
 *
 * Arquitectura modular y reactiva con datos agregados en tiempo real:
 * - CockpitCommandStrip: Estado operativo y accesos directos rápidos.
 * - CockpitAlertStrip: Alertas operativas proactivas (SLA Meta 24h, cobros y tareas).
 * - CockpitFollowupsToday: Contactos que superaron su SLA de seguimiento hoy (WhatsApp directo).
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
import type { Client } from '@/payload-types'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { getUpcomingAgenda } from '@/lib/agenda-data'
import { CalendarClock, CircleDollarSign, RefreshCcw, SquareCheck } from 'lucide-react'
import Link from 'next/link'
import { OledCard } from '@/components/workspace/oled'

const agendaDateFmt = new Intl.DateTimeFormat('es-VE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Caracas',
})
import { CockpitCommandStrip } from '@/components/workspace/overview/CockpitCommandStrip'
import { CockpitAlertStrip } from '@/components/workspace/overview/CockpitAlertStrip'
import { CockpitKpiGrid } from '@/components/workspace/overview/CockpitKpiGrid'
import { CockpitFollowupsToday } from '@/components/workspace/overview/CockpitFollowupsToday'
import { CockpitCashflowChart } from '@/components/workspace/overview/CockpitCashflowChart'
import { CockpitConversionFunnel } from '@/components/workspace/overview/CockpitConversionFunnel'
import { CockpitSourceBreakdown } from '@/components/workspace/overview/CockpitSourceBreakdown'
import { CockpitPipelinePriorities } from '@/components/workspace/overview/CockpitPipelinePriorities'
import { CockpitOmnichannelFeed } from '@/components/workspace/overview/CockpitOmnichannelFeed'

export default async function WorkspacePage() {
  const { payload, tenant, tenantId, user, canEdit } = await getWorkspaceContext()
  const [data, agenda] = await Promise.all([
    getWorkspaceOverviewData({ payload, user, tenantId }),
    getUpcomingAgenda({ payload, user, tenantId, days: 7 }),
  ])

  // Lista ligera de clientes (solo id/name) para el dialog de "+ Cobro".
  const clientsForDialog = canEdit
    ? await payload.find({
        collection: 'clients',
        limit: 200,
        sort: 'name',
        depth: 0,
        select: { name: true },
        where: { tenant: { equals: tenantId } },
        overrideAccess: false,
        user,
      })
    : null

  return (
    <div className="space-y-4">
      <CockpitCommandStrip
        tenant={tenant}
        dateTitle={data.dateTitle}
        canEdit={canEdit}
        clients={(clientsForDialog?.docs ?? []) as Client[]}
      />

      <CockpitAlertStrip alerts={data.operationalAlerts} />

      <CockpitFollowupsToday items={data.followupsToday} />

      {/* Agenda unificada 7 días: citas GCal + tareas + cobros + renovaciones */}
      <section>
        <h2 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
          Agenda próxima · 7 días
        </h2>
        <OledCard className="!p-0">
          {agenda.length === 0 ? (
            <div className="px-4 py-3 text-xs font-mono text-zinc-500">Nada agendado esta semana.</div>
          ) : (
            <div className="flex flex-col">
              {agenda.slice(0, 8).map((item, i) => (
                <Link
                  key={`${item.type}-${i}-${item.date}`}
                  href={item.href}
                  className="flex items-center gap-3 border-b border-zinc-900 px-4 py-2.5 last:border-0 hover:bg-zinc-950/60"
                >
                  <span className="text-zinc-500">
                    {item.type === 'cita' ? (
                      <CalendarClock size={14} />
                    ) : item.type === 'task' ? (
                      <SquareCheck size={14} />
                    ) : item.type === 'payment' ? (
                      <CircleDollarSign size={14} />
                    ) : (
                      <RefreshCcw size={14} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-white">{item.label}</strong>
                    <span className="text-[10px] font-mono text-zinc-500">{item.sublabel}</span>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-zinc-400">
                    {agendaDateFmt.format(new Date(item.date))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </OledCard>
      </section>

      <CockpitKpiGrid metrics={data.metrics} revenueSeries={data.cashflowPoints.map((p) => p.paid)} />

      {/* Bento superior: heatmap anual (ancho) + embudo de conversión (lateral) */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ActivityHeatmap daysData={data.dayBuckets} totalInteractions={data.totalYearInteractions} />
        </div>
        <div className="lg:col-span-4">
          <CockpitConversionFunnel metrics={data.metrics} />
        </div>
      </section>

      {/* Bento medio: flujo de caja (ancho) + canales y prioridades apilados (lateral) */}
      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CockpitCashflowChart points={data.cashflowPoints} />
        </div>
        <div className="space-y-3.5 lg:col-span-5">
          <CockpitSourceBreakdown sources={data.sourceBreakdown} />
          <CockpitPipelinePriorities hotLeads={data.hotLeads} />
        </div>
      </section>

      <CockpitOmnichannelFeed
        conversations={data.recentConversations}
        summaries={data.recentSummaries}
        emails={data.recentEmails}
        payments={data.recentPayments}
        nowTime={data.nowTime}
      />
    </div>
  )
}
