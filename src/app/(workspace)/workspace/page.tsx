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
import { getUpcomingAgenda } from '@/lib/agenda-data'
import { CockpitFocusViews } from '@/components/workspace/overview/CockpitFocusViews'
import type { TimeRangeKey } from '@/components/workspace/overview/types'

const VALID_RANGES: TimeRangeKey[] = ['hoy', '7d', '30d', '90d', 'ano']

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ vista?: string; rango?: string }>
}) {
  const [{ payload, tenant, tenantId, user, canEdit }, queryParams] = await Promise.all([
    getWorkspaceContext(),
    searchParams ? searchParams : Promise.resolve({ vista: undefined, rango: undefined }),
  ])

  const initialView = queryParams?.vista === 'ejecutiva' ? 'ejecutiva' : 'operativa'
  const timeRange: TimeRangeKey =
    queryParams?.rango && VALID_RANGES.includes(queryParams.rango as TimeRangeKey)
      ? (queryParams.rango as TimeRangeKey)
      : '30d'

  const [data, agenda] = await Promise.all([
    getWorkspaceOverviewData({ payload, user, tenant, tenantId, timeRange }),
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
    <CockpitFocusViews
      tenant={tenant}
      dateTitle={data.dateTitle}
      canEdit={canEdit}
      clients={(clientsForDialog?.docs ?? []) as Client[]}
      data={data}
      agenda={agenda}
      initialView={initialView}
    />
  )
}

