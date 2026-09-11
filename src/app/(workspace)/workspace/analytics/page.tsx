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
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'

import { getAnalyticsData } from '@/lib/analytics-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { monthlyRevenueSeries } from '@/lib/db-aggregates'
import { getConversionReport } from '@/lib/conversion-reports'
import { ConversionReportTable } from '@/components/workspace/analytics/ConversionReportTable'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Button } from '@/components/ui/button'
import {
  MonoAreaChart,
  MonoDonutChart,
  MonoFunnel,
} from '@/components/workspace/monocharts'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function AnalyticsPage() {
  const context = await getWorkspaceContext()
  const [data, revenueSeries, conversionReport] = await Promise.all([
    getAnalyticsData(context),
    monthlyRevenueSeries(context.payload, context.tenantId, 12),
    getConversionReport({ payload: context.payload, user: context.user, tenantId: context.tenantId }),
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
      <PageHeader
        eyebrow={`Inteligencia y analítica · ${context.tenant.name}`}
        title="Métricas de Conversión y Calidad"
        description="Rendimiento comercial, embudo de captación y satisfacción de clientes."
        actions={
          <>
            <Button asChild className="border border-border bg-muted font-mono text-xs font-bold uppercase text-foreground hover:bg-accent">
              <Link href="/workspace/crm"><Users className="h-4 w-4" />Ver CRM</Link>
            </Button>
            <Button asChild className="bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300">
              <Link href="/workspace/billing"><TrendingUp className="h-4 w-4" />Ver Facturación</Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} note={kpi.note} />
        ))}
      </section>

      {/* Tendencia de ingresos de los últimos 12 meses (datos agregados en BD) */}
      <div className="bg-card text-card-foreground border border-border p-3.5">
        <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Facturación</p>
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Ingresos Cobrados · Últimos 12 Meses</h2>
          </div>
          <Link href="/workspace/billing" className="text-xs text-muted-foreground hover:text-foreground font-mono transition">
            Ver cobros →
          </Link>
        </div>
        {revenueTrend.every((p) => p.value === 0) ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">Aún no hay pagos confirmados en los últimos 12 meses.</div>
        ) : (
          <div className="pt-2">
            <MonoAreaChart data={revenueTrend} unit="USD" height={190} />
          </div>
        )}
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="bg-card text-card-foreground border border-border p-3.5">
          <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pipeline</p>
              <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Embudo de Conversión de Leads</h2>
            </div>
            <Link href="/workspace/crm" className="text-xs text-muted-foreground hover:text-foreground font-mono transition">
              Ver leads →
            </Link>
          </div>

          {funnel.totalLeads === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin leads registrados en el tenant activo.</div>
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

              <div className="pt-3 border-t border-border grid grid-cols-4 gap-2 text-center text-xs font-mono">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Nuevos</div>
                  <div className="font-bold text-foreground mt-0.5">{funnel.nuevo}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Contactados</div>
                  <div className="font-bold text-foreground mt-0.5">{funnel.contactado}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Calificados</div>
                  <div className="font-bold text-foreground mt-0.5">{funnel.calificado}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Descartados</div>
                  <div className="font-bold text-rose-400 mt-0.5">{funnel.descartado}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-card text-card-foreground border border-border p-3.5">
            <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Tally Forms</p>
                <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Satisfacción y Calidad</h2>
              </div>
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Total respuestas</span>
                <span className="font-bold text-foreground">{satisfaction.totalSubmissions}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Envíos sin quejas</span>
                <span className="text-emerald-400 font-bold">{satisfaction.positiveSubmissions} ({satisfaction.satisfactionRate}%)</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Quejas / Alertas</span>
                <span className={`font-bold ${satisfaction.complaints > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {satisfaction.complaints} alertas
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card text-card-foreground border border-border p-3.5">
            <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Timeline</p>
                <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Interacciones del Mes</h2>
              </div>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground flex items-center gap-1.5"><PhoneCall className="w-3 h-3" /> Llamadas</span>
                <span className="font-bold text-foreground">{activities.byType.llamada}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> WhatsApp</span>
                <span className="font-bold text-foreground">{activities.byType.whatsapp}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground flex items-center gap-1.5"><Users className="w-3 h-3" /> Reuniones</span>
                <span className="font-bold text-foreground">{activities.byType.reunion}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground flex items-center gap-1.5"><Layers className="w-3 h-3" /> Notas y seguimiento</span>
                <span className="font-bold text-foreground">{activities.byType.nota + activities.byType.email + activities.byType.otro}</span>
              </div>
            </div>
          </div>

          <div className="bg-card text-card-foreground border border-border p-3.5">
            <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Operaciones</p>
                <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Cumplimiento de Tareas</h2>
              </div>
              <Link href="/workspace/tasks" className="text-xs text-muted-foreground hover:text-foreground font-mono transition">
                Ver tareas →
              </Link>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Tasa de finalización</span>
                <span className="text-emerald-400 font-bold">{tasks.completionRate}%</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Completadas este mes</span>
                <span className="font-bold text-foreground">{tasks.completedMonth}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Pendientes activas</span>
                <span className="font-bold text-amber-400">{tasks.pendingTotal}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Atrasadas / Vencidas</span>
                <span className={`font-bold ${tasks.overdueTotal > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {tasks.overdueTotal} {tasks.overdueTotal === 1 ? 'tarea' : 'tareas'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Desglose del embudo por origen y por agente (ítem 5, sector operacional) */}
      <div className="bg-card text-card-foreground border border-border p-3.5">
        <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rendimiento comercial</p>
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Conversión por Origen y por Agente</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Embudo entrada → contactado → calificado → cliente. Agregado en base de datos.</p>
          </div>
          <Link href="/workspace/crm" className="text-xs text-muted-foreground hover:text-foreground font-mono transition">
            Ver CRM →
          </Link>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <ConversionReportTable
            eyebrow="Por origen de captación"
            title="Origen"
            rows={conversionReport.bySource}
          />
          <ConversionReportTable
            eyebrow="Por agente asignado"
            title="Agente"
            rows={conversionReport.byAgent}
          />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="bg-card text-card-foreground border border-border p-3.5">
          <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Composición</p>
              <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Leads por Canal</h2>
            </div>
          </div>
          {sources.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin datos suficientes todavía.</div>
          ) : (
            <MonoDonutChart data={sources.map((s) => ({ label: s.label, value: s.count }))} centerLabel="LEADS" />
          )}
        </div>
        <div className="bg-card text-card-foreground border border-border p-3.5">
          <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Composición</p>
              <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Clientes por Etapa</h2>
            </div>
          </div>
          {clientsByStage.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin clientes registrados todavía.</div>
          ) : (
            <MonoDonutChart data={clientsByStage} centerLabel="CLIENTES" />
          )}
        </div>
      </section>

      <div className="bg-card text-card-foreground border border-border p-3.5">
        <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Adquisición</p>
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Canales de Captación de Leads</h2>
          </div>
          <Link href="/workspace/crm" className="text-xs text-muted-foreground hover:text-foreground font-mono transition inline-flex items-center gap-1">
            Explorar CRM <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {sources.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">No hay registros suficientes de leads para segmentar canales.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sources.map((item) => (
              <div key={item.source} className="border border-border bg-muted/40 p-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-foreground font-mono">{item.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{item.pct}%</span>
                </div>
                <div className="text-lg font-bold text-foreground font-mono">{item.count}</div>
                <div className="h-1 bg-muted mt-2 overflow-hidden">
                  <div className="h-full bg-sky-400" style={{ width: `${Math.max(item.pct, 4)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
