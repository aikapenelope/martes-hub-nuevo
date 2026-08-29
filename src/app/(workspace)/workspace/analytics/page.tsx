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
      highlight: funnel.leadToClientPct >= 20,
    },
    {
      label: 'Satisfacción Formularios',
      value: `${satisfaction.satisfactionRate}%`,
      note: `${satisfaction.positiveSubmissions} sin quejas de ${satisfaction.totalSubmissions} envíos`,
      icon: Sparkles,
      highlight: satisfaction.satisfactionRate >= 90,
    },
    {
      label: 'Actividad Comercial (Mes)',
      value: activities.totalMonth,
      note: `${activities.byType.llamada} llamadas, ${activities.byType.reunion} reuniones, ${activities.byType.whatsapp} chats`,
      icon: Activity,
      highlight: false,
    },
    {
      label: 'Cobrado en el Mes',
      value: usd.format(financials.collectedMonth),
      note: `${usd.format(financials.pendingCollection)} pendiente por cobrar`,
      icon: CircleDollarSign,
      highlight: false,
    },
  ]

  return (
    <>
      {/* Hero */}
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Inteligencia y Analítica · {context.tenant.name}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Métricas de Conversión y Calidad</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Rendimiento comercial, embudo de captación y satisfacción de clientes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/workspace/crm"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
            >
              <Users className="w-3.5 h-3.5" /> Ver CRM
            </Link>
            <Link
              href="/workspace/billing"
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 shadow-lg uppercase tracking-wider font-mono"
            >
              <TrendingUp className="w-3.5 h-3.5" /> Ver Facturación
            </Link>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, note, icon: Icon, highlight }) => (
          <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl" key={label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">{label}</p>
                <p className={`mt-1.5 text-2xl font-bold tracking-tight font-mono ${highlight ? 'text-emerald-400' : 'text-white'}`}>
                  {value}
                </p>
              </div>
              <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
              <span className="font-mono text-xs text-zinc-400">{note}</span>
            </div>
          </article>
        ))}
      </section>

      {/* Embudo y Calidad */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        {/* Embudo de conversión */}
        <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Pipeline</p>
              <h2 className="text-base font-bold text-white">Embudo de Conversión de Leads</h2>
            </div>
            <Link href="/workspace/crm" className="text-xs text-zinc-400 hover:text-white font-mono transition">
              Ver leads →
            </Link>
          </div>

          {funnel.totalLeads === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-500 font-mono">
              Sin leads registrados en el tenant activo.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Nuevo ➔ Contactado ({funnel.contactado + funnel.calificado + funnel.convertedToClients} de {funnel.totalLeads})</span>
                  <span className="font-bold text-emerald-400">{funnel.nuevoToContactadoPct}%</span>
                </div>
                <div className="h-2 bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(funnel.nuevoToContactadoPct, 4))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Contactado ➔ Calificado ({funnel.calificado + funnel.convertedToClients} de {funnel.contactado + funnel.calificado + funnel.convertedToClients})</span>
                  <span className="font-bold text-amber-400">{funnel.contactadoToCalificadoPct}%</span>
                </div>
                <div className="h-2 bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(funnel.contactadoToCalificadoPct, 4))}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span className="text-zinc-300">Calificado ➔ Cliente ({funnel.convertedToClients} clientes activos)</span>
                  <span className="font-bold text-sky-400">{funnel.leadToClientPct}% global</span>
                </div>
                <div className="h-2 bg-zinc-800 overflow-hidden">
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
        </div>

        {/* Calidad & Actividades */}
        <div className="space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Tally Forms</p>
                <h2 className="text-base font-bold text-white">Satisfacción y Calidad</h2>
              </div>
              <FileSpreadsheet className="w-4 h-4 text-zinc-400" />
            </div>
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
          </div>

          <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Timeline</p>
                <h2 className="text-base font-bold text-white">Interacciones del Mes</h2>
              </div>
              <Activity className="w-4 h-4 text-zinc-400" />
            </div>
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
          </div>
        </div>
      </section>

      {/* Canales de Adquisición */}
      <section className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Adquisición</p>
            <h2 className="text-base font-bold text-white">Canales de Captación de Leads</h2>
          </div>
          <Link href="/workspace/crm" className="text-xs text-zinc-400 hover:text-white font-mono transition inline-flex items-center gap-1">
            Explorar CRM <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {sources.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-500 font-mono">
            No hay registros suficientes de leads para segmentar canales.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {sources.map((item) => (
              <div key={item.source} className="border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-white font-mono">{item.label}</span>
                  <span className="text-[10px] font-mono text-zinc-400">{item.pct}%</span>
                </div>
                <div className="text-lg font-bold text-white font-mono">{item.count}</div>
                <div className="h-1 bg-zinc-800 mt-2 overflow-hidden">
                  <div className="h-full bg-white" style={{ width: `${Math.max(item.pct, 4)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
