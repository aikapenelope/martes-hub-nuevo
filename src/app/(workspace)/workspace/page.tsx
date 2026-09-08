/**
 * WorkspacePage — Torre de Control Comercial (Deep OLED).
 *
 * Arquitectura modular y reactiva con datos agregados en tiempo real:
 * - CockpitCommandStrip: Estado operativo y accesos directos rápidos.
 * - CockpitAlertStrip: Alertas operativas proactivas (SLA Meta 24h, cobros y tareas).
 * - CockpitFollowupsToday: Contactos que superaron su SLA de seguimiento hoy (WhatsApp directo).
 * - CockpitKpiGrid: 5 tarjetas de métricas comerciales y salud del canal.
 * - ActivityHeatmap: Matriz anual interactiva de 364 días (actividades + mensajes + pagos).
 * - WeeklyCashflowCard: Cobranza de 8 semanas en barras segmentadas (cobrado por paid_at + pendiente por due_date).
 * - CockpitCashflowChart: Flujo de caja de 6 meses (cobrado por paid_at + pendiente por due_date).
 * - CockpitConversionFunnel: Embudo de conversión real entre etapas de leads y clientes.
 * - CockpitSourceBreakdown: Desglose de canales de captación (Google Maps, WhatsApp, etc.).
 * - CockpitPipelinePriorities: Prioridades de leads con actividad reciente.
 * - CockpitOmnichannelFeed: Feed consolidado omnicanal (WhatsApp, IA, Email, Cobros).
 */

import 'server-only'

import Link from 'next/link'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Client, Segment, User } from '@/payload-types'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import { getMonthlyTrends, getWeeklyCashflow } from '@/lib/trend-widgets'
import { TrendStrip } from '@/components/workspace/overview/TrendStrip'
import { WeeklyCashflowCard } from '@/components/workspace/overview/WeeklyCashflowCard'
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

  const [data, agenda, trends, cashflow] = await Promise.all([
    getWorkspaceOverviewData({ payload, user, tenant, tenantId, timeRange }),
    getUpcomingAgenda({ payload, user, tenantId, days: 7 }),
    getMonthlyTrends({ payload, tenantId, user }),
    getWeeklyCashflow({ payload, tenantId, user }),
  ])

  // Lista ligera de clientes (solo id/name) para el dialog de "+ Cobro".
  // Agentes asignables y rubros del tenant para la pestaña "Datos CRM" del
  // drawer 360°: sin estas opciones el formulario perdería las relaciones
  // existentes al guardar (mismos criterios que el pipeline del CRM).
  const [clientsForDialog, agentsForDrawer, segmentsForDrawer] = await Promise.all([
    canEdit
      ? payload.find({
          collection: 'clients',
          limit: 200,
          sort: 'name',
          depth: 0,
          select: { name: true },
          where: { tenant: { equals: tenantId } },
          overrideAccess: false,
          user,
        })
      : Promise.resolve(null),
    canEdit
      ? payload.find({
          collection: 'users',
          where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
          limit: 100,
          depth: 0,
          overrideAccess: false,
          user,
        })
      : Promise.resolve(null),
    canEdit
      ? payload.find({
          collection: 'segments',
          where: { tenant: { equals: tenantId } },
          limit: 200,
          depth: 0,
          overrideAccess: false,
          user,
        })
      : Promise.resolve(null),
  ])

  const RANGES: Array<{ key: TimeRangeKey; label: string }> = [
    { key: 'hoy', label: 'Hoy' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '1M' },
    { key: '90d', label: '3M' },
    { key: 'ano', label: '1A' },
  ]
  const QUICK_ACTIONS = [
    { href: '/workspace/billing', title: 'Registrar cobro', desc: 'Pagos, facturas y conciliación.' },
    { href: '/workspace/outreach', title: 'Prospección WhatsApp', desc: 'Interesados con mensajes listos.' },
    { href: '/workspace/email', title: 'Nueva campaña', desc: 'Email masivo por segmento.' },
    { href: '/workspace/activities', title: 'Registrar actividad', desc: 'Llamadas, reuniones, notas.' },
  ]

  return (
    <div className="space-y-4">
      {/* Selector de rango (estilo dashboard-9: 14D/1M/3M/6M) */}
      <nav aria-label="Rango de tiempo" className="flex items-center gap-1">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/workspace?rango=${r.key}&vista=${initialView}`}
            aria-current={timeRange === r.key ? 'true' : undefined}
            className={`px-2.5 py-1 text-[11px] font-mono uppercase transition ${
              timeRange === r.key ? 'bg-white text-black font-bold' : 'border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {trends && <TrendStrip trends={trends} />}

      {/* Cobranza de 8 semanas (chart segmentado: blanco = cobrado, gris = pendiente) */}
      {cashflow && <WeeklyCashflowCard data={cashflow} />}

      {/* Accesos rápidos (patrón dashboard-9: chevron a la derecha de cada fila) */}
      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Acciones rápidas">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="oled-card p-3.5 transition hover:border-zinc-600 flex items-center justify-between gap-2 group"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">{action.title}</p>
              <p className="mt-1 text-[11px] text-zinc-500 truncate">{action.desc}</p>
            </div>
            <span className="font-mono text-sm text-zinc-600 group-hover:text-zinc-300 transition shrink-0" aria-hidden="true">
              &gt;
            </span>
          </Link>
        ))}
      </section>
      <CockpitFocusViews
        tenant={tenant}
        dateTitle={data.dateTitle}
        canEdit={canEdit}
        clients={(clientsForDialog?.docs ?? []) as Client[]}
        assignees={(agentsForDrawer?.docs ?? []) as User[]}
        segments={(segmentsForDrawer?.docs ?? []) as Segment[]}
        data={data}
        agenda={agenda}
        initialView={initialView}
      />
    </div>
  )
}

