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
import { ArrowRight, CalendarPlus, CreditCard, Mail, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const RANGES: { key: TimeRangeKey; label: string }[] = [
    { key: 'hoy', label: 'Hoy' },
    { key: '7d', label: '7D' },
    { key: '30d', label: '1M' },
    { key: '90d', label: '3M' },
    { key: 'ano', label: '1A' },
  ]
  const QUICK_ACTIONS = [
    {
      href: '/workspace/billing',
      title: 'Registrar cobro',
      desc: 'Pagos, facturas y conciliación.',
      icon: CreditCard,
    },
    {
      href: '/workspace/outreach',
      title: 'Prospección WhatsApp',
      desc: 'Interesados con mensajes listos.',
      icon: MessageSquare,
    },
    {
      href: '/workspace/email',
      title: 'Nueva campaña',
      desc: 'Email masivo por segmento.',
      icon: Mail,
    },
    {
      href: '/workspace/activities',
      title: 'Registrar actividad',
      desc: 'Llamadas, reuniones, notas.',
      icon: CalendarPlus,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Selector de rango de tiempo estilo segmented control */}
      <nav aria-label="Rango de tiempo" className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/workspace?rango=${r.key}&vista=${initialView}`}
            aria-current={timeRange === r.key ? 'true' : undefined}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              timeRange === r.key
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {trends && <TrendStrip trends={trends} />}

      {/* Cobranza de 8 semanas */}
      {cashflow && <WeeklyCashflowCard data={cashflow} />}

      {/* Accesos rápidos: cuadrícula bento interactiva con iconos refinados */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border p-px" aria-label="Acciones rápidas">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group relative flex items-center justify-between gap-3 bg-background p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/30">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {action.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{action.desc}</p>
                </div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          )
        })}
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

