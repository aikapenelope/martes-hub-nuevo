import 'server-only'

import React from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
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
import { EmptyState, HeroAction, KpiCard, OledCard, PageHero, SectionHeader } from '@/components/workspace/oled'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function AnalyticsPage() {
  const context = await getWorkspaceContext()
  const data = await getAnalyticsData(context)

  const { funnel, satisfaction, sources, activities, financials } = data

  const kpis = [
    {
      label: 'Conversión Lead ➔ Cliente',
      value: `${funnel.leadToClientPct}%`,
      note: `${funnel.convertedToClients} clientes de ${funnel.totalLeads} leads`,
      icon: UserCheck,
      accent: 'cyan' as const,
    },
    {
      label: 'Satisfacción Formularios',
      value: `${satisfaction.satisfactionRate}%`,
      note: `${satisfaction.positiveSubmissions} sin quejas de ${satisfaction.totalSubmissions} envíos`,
      icon: Sparkles,
      accent: 'indigo' as const,
    },
    {
      label: 'Actividad Comercial (Mes)',
      value: activities.totalMonth,
      note: `${activities.byType.llamada} llamadas, ${activities.byType.reunion} reuniones, ${activities.byType.whatsapp} chats`,
      icon: Activity,
      accent: 'sky' as const,
    },
    {
      label: 'Cobrado en el Mes',
      value: usd.format(financials.collectedMonth),
      note: `${usd.format(financials.pendingCollection)} pendiente por cobrar`,
      icon: CircleDollarSign,
      accent: 'amber' as const,
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
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">
                    Nuevo ➔ Contactado ({funnel.contactado + funnel.calificado + funnel.convertedToClients} de {funnel.totalLeads})
                  </span>
                  <span className="font-bold text-emerald-400">{funnel.nuevoToContactadoPct}%</span>
                </div>
                <div className="h-2 bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(funnel.nuevoToContactadoPct, 4))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">
                    Contactado ➔ Calificado ({funnel.calificado + funnel.convertedToClients} de {funnel.contactado + funnel.calificado + funnel.convertedToClients})
                  </span>
                  <span className="font-bold text-amber-400">{funnel.contactadoToCalificadoPct}%</span>
                </div>
                <div className="h-2 bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(funnel.contactadoToCalificadoPct, 4))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Calificado ➔ Cliente ({funnel.convertedToClients} clientes activos)</span>
                  <span className="font-bold text-sky-400">{funnel.leadToClientPct}% global</span>
                </div>
                <div className="h-2 bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-sky-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(funnel.leadToClientPct, 4))}%` }} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800 grid grid-cols-4 gap-2 text-center text-xs font-mono">
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
                  <div className="font-bold text-red-400 mt-0.5">{funnel.descartado}</div>
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
        </div>
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
