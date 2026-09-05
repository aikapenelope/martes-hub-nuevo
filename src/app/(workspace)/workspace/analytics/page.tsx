import 'server-only'

import React from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CheckSquare,
  CircleDollarSign,
  FileSpreadsheet,
  Layers,
  MessageSquare,
  PhoneCall,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'

import { getAnalyticsData } from '@/lib/analytics-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { monthlyRevenueSeries } from '@/lib/db-aggregates'
import { EmptyState, HeroAction, KpiCard, OledCard, PageHero, SectionHeader } from '@/components/workspace/oled'
import {
  MonoAreaChart,
  MonoDonutChart,
  MonoFunnel,
  type FunnelStage,
} from '@/components/workspace/monocharts'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function AnalyticsPage() {
  const context = await getWorkspaceContext()
  const [data, revenueSeries] = await Promise.all([
    getAnalyticsData(context),
    monthlyRevenueSeries(context.payload, context.tenantId, 12),
  ])

  const { funnel, satisfaction, sources, clientsByStage, activities, financials, tasks } = data

  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const revenueTrend = revenueSeries.map((p) => ({
    label: monthNames[Number(p.month.split('-')[1]) - 1] ?? p.month,
    value: p.total,
  }))

  const kpis = [
    {
      label: 'Conversión Lead ➔ Cliente',
      value: `${funnel.leadToClientPct}%`,
      note: `${funnel.convertedToClients} clientes de ${funnel.totalLeads} leads`,
      icon: UserCheck,
      accent: 'cyan' as const,
    },
    {
      label: 'Cobrado en el Mes (USD)',
      value: usd.format(financials.collectedMonth),
      note: `${financials.collectionRate}% efectividad (${usd.format(financials.pendingCollection)} pend.)`,
      icon: CircleDollarSign,
      accent: 'amber' as const,
    },
    {
      label: 'Cotizaciones en Pipeline',
      value: usd.format(financials.quotesActiveTotal),
      note: `${financials.quotesCount} cotizaciones emitidas`,
      icon: TrendingUp,
      accent: 'sky' as const,
    },
    {
      label: 'Eficiencia Operativa Tareas',
      value: `${tasks.completionRate}%`,
      note: `${tasks.completedMonth} completadas (${tasks.overdueTotal} vencidas)`,
      icon: CheckSquare,
      accent: 'indigo' as const,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Inteligencia y analítica · ${context.tenant.name}`}
        title="Métricas de Conversión y Calidad"
        description="Rendimiento comercial, embudo de captación y satisfacción de clientes."
        actions={
          <>
            <HeroAction href="/workspace/crm" icon={Users}>Ver CRM</HeroAction>
            <HeroAction href="/workspace/billing" icon={TrendingUp} variant="primary">Ver Facturación</HeroAction>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} note={kpi.note} />
        ))}
      </section>

      {/* Tendencia de ingresos de los últimos 12 meses (datos agregados en BD) */}
      <OledCard>
        <SectionHeader
          eyebrow="Facturación"
          title="Ingresos Cobrados · Últimos 12 Meses"
          action={
            <Link href="/workspace/billing" className="text-xs text-zinc-400 hover:text-white font-mono transition">
              Ver cobros →
            </Link>
          }
        />
        {revenueTrend.every((p) => p.value === 0) ? (
          <EmptyState>Aún no hay pagos confirmados en los últimos 12 meses.</EmptyState>
        ) : (
          <div className="pt-2">
            <MonoAreaChart data={revenueTrend} unit="USD" height={190} />
          </div>
        )}
      </OledCard>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <OledCard>
          <SectionHeader
            eyebrow="Pipeline"
            title="Embudo de Conversión de Leads"
            action={
              <Link href="/workspace/crm" className="text-xs text-zinc-400 hover:text-white font-mono transition">
                Ver leads →
              </Link>
            }
          />

          {funnel.totalLeads === 0 ? (
            <EmptyState>Sin leads registrados en el tenant activo.</EmptyState>
          ) : (
            <div className="space-y-4">
              <MonoFunnel
                stages={[
                  {
                    label: 'Nuevo / Inbound',
                    count: funnel.nuevo,
                    colorAccent: '#71717a',
                  },
                  {
                    label: 'Contactado',
                    count: funnel.contactado,
                    conversionRate: funnel.nuevoToContactadoPct,
                    colorAccent: '#38bdf8',
                  },
                  {
                    label: 'Calificado',
                    count: funnel.calificado,
                    conversionRate: funnel.contactadoToCalificadoPct,
                    colorAccent: '#818cf8',
                  },
                  {
                    label: 'Cliente Activo',
                    count: funnel.convertedToClients,
                    conversionRate: funnel.leadToClientPct,
                    colorAccent: '#ffffff',
                  },
                ]}
              />

              <div className="pt-3 border-t border-zinc-900 grid grid-cols-4 gap-2 text-center text-xs font-mono">
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Nuevos</div>
                  <div className="font-bold text-white mt-0.5">{funnel.nuevo}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Contactados</div>
                  <div className="font-bold text-white mt-0.5">{funnel.contactado}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Calificados</div>
                  <div className="font-bold text-white mt-0.5">{funnel.calificado}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Descartados</div>
                  <div className="font-bold text-rose-400 mt-0.5">{funnel.descartado}</div>
                </div>
              </div>
            </div>
          )}
        </OledCard>

        <div className="space-y-4">
          <OledCard>
            <SectionHeader eyebrow="Tally Forms" title="Satisfacción y Calidad" action={<FileSpreadsheet className="w-4 h-4 text-zinc-400" />} />
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400">Total respuestas</span>
                <span className="font-bold text-white">{satisfaction.totalSubmissions}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400">Envíos sin quejas</span>
                <span className="text-emerald-400 font-bold">{satisfaction.positiveSubmissions} ({satisfaction.satisfactionRate}%)</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-zinc-400">Quejas / Alertas</span>
                <span className={`font-bold ${satisfaction.complaints > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {satisfaction.complaints} alertas
                </span>
              </div>
            </div>
          </OledCard>

          <OledCard>
            <SectionHeader eyebrow="Timeline" title="Interacciones del Mes" action={<Activity className="w-4 h-4 text-zinc-400" />} />
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400 flex items-center gap-1.5"><PhoneCall className="w-3 h-3" /> Llamadas</span>
                <span className="font-bold text-white">{activities.byType.llamada}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400 flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> WhatsApp</span>
                <span className="font-bold text-white">{activities.byType.whatsapp}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400 flex items-center gap-1.5"><Users className="w-3 h-3" /> Reuniones</span>
                <span className="font-bold text-white">{activities.byType.reunion}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-zinc-400 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Notas y seguimiento</span>
                <span className="font-bold text-white">{activities.byType.nota + activities.byType.email + activities.byType.otro}</span>
              </div>
            </div>
          </OledCard>

          <OledCard>
            <SectionHeader
              eyebrow="Operaciones"
              title="Cumplimiento de Tareas"
              action={
                <Link href="/workspace/tasks" className="text-xs text-zinc-400 hover:text-white font-mono transition">
                  Ver tareas →
                </Link>
              }
            />
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400">Tasa de finalización</span>
                <span className="text-emerald-400 font-bold">{tasks.completionRate}%</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400">Completadas este mes</span>
                <span className="font-bold text-white">{tasks.completedMonth}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-400">Pendientes activas</span>
                <span className="font-bold text-amber-400">{tasks.pendingTotal}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-zinc-400">Atrasadas / Vencidas</span>
                <span className={`font-bold ${tasks.overdueTotal > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                  {tasks.overdueTotal} {tasks.overdueTotal === 1 ? 'tarea' : 'tareas'}
                </span>
              </div>
            </div>
          </OledCard>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <OledCard>
          <SectionHeader eyebrow="Composición" title="Leads por Canal" />
          {sources.length === 0 ? (
            <EmptyState>Sin datos suficientes todavía.</EmptyState>
          ) : (
            <MonoDonutChart data={sources.map((s) => ({ label: s.label, value: s.count }))} centerLabel="LEADS" />
          )}
        </OledCard>
        <OledCard>
          <SectionHeader eyebrow="Composición" title="Clientes por Etapa" />
          {clientsByStage.length === 0 ? (
            <EmptyState>Sin clientes registrados todavía.</EmptyState>
          ) : (
            <MonoDonutChart data={clientsByStage} centerLabel="CLIENTES" />
          )}
        </OledCard>
      </section>

      <OledCard>
        <SectionHeader
          eyebrow="Adquisición"
          title="Canales de Captación de Leads"
          action={
            <Link href="/workspace/crm" className="text-xs text-zinc-400 hover:text-white font-mono transition inline-flex items-center gap-1">
              Explorar CRM <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />

        {sources.length === 0 ? (
          <EmptyState>No hay registros suficientes de leads para segmentar canales.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sources.map((item) => (
              <div key={item.source} className="oled-subcard p-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-white font-mono">{item.label}</span>
                  <span className="text-[10px] font-mono text-zinc-400">{item.pct}%</span>
                </div>
                <div className="text-lg font-bold text-white font-mono">{item.count}</div>
                <div className="h-1 bg-zinc-900 mt-2 overflow-hidden">
                  <div className="h-full bg-sky-400" style={{ width: `${Math.max(item.pct, 4)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </OledCard>
    </div>
  )
}
