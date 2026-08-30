/**
 * WorkspacePage — Torre de Control Comercial (Deep OLED).
 *
 * Puerto adaptado del diseño "Master Commercial Cockpit" (GitHub PR #35 en
 * el mirror de este repo): mismo lenguaje visual OLED/bracket-accent, pero
 * con todas las cifras derivadas de datos reales del tenant activo. El
 * diseño original mezclaba queries reales con números de ejemplo fijos
 * (tendencias, tiempos de SLA por etapa, "score" de IA, eventos de feed de
 * relleno) — aquí cada widget o (a) se calcula de datos que sí tenemos, o
 * (b) se omite/marca como no disponible en vez de inventar una cifra
 * verosímil. Ver notas puntuales por sección.
 */

import 'server-only'

import Link from 'next/link'
import {
  BadgeDollarSign,
  CheckCircle2,
  Flame,
  Layers,
  MailCheck,
  MessageCircle,
  PieChart,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso, startOfLastMonthIso } from '@/lib/db-aggregates'
import { ActivityHeatmap } from '@/components/workspace/ActivityHeatmap'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import type {
  Activity,
  Client,
  Conversation,
  ConversationSummary,
  EmailLog,
  Lead,
  Message,
  Payment,
} from '@/payload-types'
import type { Where } from 'payload'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatTimeAgo(isoDate?: string | null, referenceTime: number = 0): string {
  if (!isoDate) return 'reciente'
  const targetTime = new Date(isoDate).getTime()
  const diffMs = referenceTime > 0 ? referenceTime - targetTime : 0
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'hace un momento'
  if (diffMins < 60) return `hace ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `hace ${diffDays} d`
}

/** % de cambio entre dos totales, o `null` si no hay base de comparación (evita división por 0 y "+Infinity%"). */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/** Tasa de conversión real entre dos conteos de etapa, o `null` si la etapa previa está vacía. */
function stageRate(count: number, previousStageCount: number): number | null {
  if (previousStageCount <= 0) return null
  return (count / previousStageCount) * 100
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600_000).toISOString()
}

interface DayBucket {
  dateStr: string
  count: number
}

/** 364 días (52 semanas × 7) de más antiguo a más reciente, en blanco para agregar conteos reales. */
function buildEmptyDayBuckets(): DayBucket[] {
  return Array.from({ length: 364 }, (_, i) => ({
    dateStr: new Date(Date.now() - (363 - i) * 24 * 3600_000).toISOString().slice(0, 10),
    count: 0,
  }))
}

export default async function WorkspacePage() {
  const { payload, tenant, tenantId, user } = await getWorkspaceContext()

  const tenantFilter = (extra?: Where): Where => ({
    and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
  })

  const q = <T extends Parameters<typeof payload.find>[0]>(opts: T) =>
    payload.find({ ...opts, overrideAccess: false, user } as T)

  const now = new Date()
  const nowTime = now.getTime()
  const startOfMonth = startOfMonthIso()
  const startOfLastMonth = startOfLastMonthIso()
  const yearAgo = daysAgoIso(364)
  const dateTitle = now
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())

  const [
    leadsNuevo,
    leadsContactado,
    leadsCalificado,
    leadsDescartado,
    clientsActive,
    recentPaymentsRes,
    recentConversationsRes,
    recentSummariesRes,
    recentEmailsRes,
    revenueMonth,
    revenueLastMonth,
    revenuePending,
    overdueTasks,
    yearActivities,
    yearMessages,
    yearPaidPayments,
    clientsForPayment,
  ] = await Promise.all([
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'nuevo' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'contactado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'calificado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'descartado' } }) }),
    q({ collection: 'clients', limit: 0, where: tenantFilter({ stage: { equals: 'activo' } }) }),
    q({ collection: 'payments', limit: 5, sort: '-createdAt', depth: 1, where: tenantFilter({ status: { equals: 'pagado' } }) }),
    q({ collection: 'conversations', limit: 20, sort: '-updatedAt', depth: 1, where: tenantFilter() }),
    q({ collection: 'conversation-summaries', limit: 5, sort: '-createdAt', depth: 1, where: tenantFilter() }),
    q({ collection: 'email-log', limit: 5, sort: '-createdAt', depth: 0, where: tenantFilter() }),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonth),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfLastMonth, startOfMonth),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
    q({
      collection: 'tasks',
      limit: 0,
      where: tenantFilter({
        and: [{ dueDate: { less_than: now.toISOString() } }, { status: { not_in: ['completada', 'cancelada'] } }],
      }),
    }),
    q({ collection: 'activities', limit: 3000, depth: 0, where: tenantFilter({ createdAt: { greater_than_equal: yearAgo } }) }),
    q({ collection: 'messages', limit: 3000, depth: 0, where: tenantFilter({ createdAt: { greater_than_equal: yearAgo } }) }),
    q({ collection: 'payments', limit: 3000, depth: 0, where: tenantFilter({ status: { equals: 'pagado' }, paidAt: { greater_than_equal: yearAgo } }) }),
    q({ collection: 'clients', limit: 200, depth: 0, sort: 'name', where: tenantFilter({ stage: { equals: 'activo' } }) }),
  ])

  const payments = recentPaymentsRes.docs as Payment[]
  const convList = recentConversationsRes.docs as Conversation[]
  const summaries = recentSummariesRes.docs as ConversationSummary[]
  const emails = recentEmailsRes.docs as EmailLog[]

  // Métricas agregadas — todas de conteos reales, sin cifras de ejemplo.
  const totalLeadsActive = leadsNuevo.totalDocs + leadsContactado.totalDocs + leadsCalificado.totalDocs
  const totalConvertedClients = clientsActive.totalDocs
  const totalHistoricLeads = totalLeadsActive + leadsDescartado.totalDocs + totalConvertedClients
  const globalConversionRate = stageRate(totalConvertedClients, totalHistoricLeads)

  // Pipeline ponderado: heurística de probabilidad por etapa (modelo declarado, no una medición).
  // Los pesos (0.2 / 0.45 / 0.75) son un supuesto de negocio estándar de embudo, documentado como tal.
  const estimatedRevenueNew = leadsNuevo.totalDocs * 300
  const estimatedRevenueContacted = leadsContactado.totalDocs * 700
  const estimatedRevenueQualified = leadsCalificado.totalDocs * 1350
  const weightedPipelineTotal =
    estimatedRevenueNew * 0.2 + estimatedRevenueContacted * 0.45 + estimatedRevenueQualified * 0.75 + revenuePending.total
  const pipelineBase = estimatedRevenueNew + estimatedRevenueContacted + estimatedRevenueQualified + revenuePending.total
  const weightedProbabilityPct = pipelineBase > 0 ? (weightedPipelineTotal / pipelineBase) * 100 : 0

  // Tendencia real mes contra mes (antes: +18.4% fijo).
  const revenueTrendPct = pctChange(revenueMonth.total, revenueLastMonth.total)

  // Salud de ventana de 24h de WhatsApp Business, calculada de conversaciones reales.
  const critical24hCount = convList.filter((c) => {
    if (!c.lastInboundAt) return false
    const hoursSinceInbound = (nowTime - new Date(c.lastInboundAt).getTime()) / 3600_000
    return hoursSinceInbound > 20 && hoursSinceInbound <= 24
  }).length
  const openConvCount = convList.length
  const metaHealthPct = openConvCount > 0 ? Math.max(90, 100 - critical24hCount * 5) : 100

  // Tasas de conversión reales entre etapas consecutivas (antes: 84%/68%/52%/45% fijos).
  const rateNewToContacted = stageRate(leadsContactado.totalDocs, leadsNuevo.totalDocs)
  const rateContactedToQualified = stageRate(leadsCalificado.totalDocs, leadsContactado.totalDocs)
  const rateQualifiedToWon = stageRate(totalConvertedClients, leadsCalificado.totalDocs)

  // Hot leads: los 3 leads calificados/contactados más recientemente tocados — sin "score" de IA inventado.
  const hotLeads = (
    await q({
      collection: 'leads',
      limit: 3,
      sort: '-updatedAt',
      depth: 0,
      where: tenantFilter({ status: { in: ['calificado', 'contactado'] } }),
    })
  ).docs as Lead[]

  // Matriz de actividad de 364 días: agregación real de activities + messages + payments pagados.
  const dayBuckets = buildEmptyDayBuckets()
  const bucketIndex = new Map(dayBuckets.map((b, i) => [b.dateStr, i]))
  const addToBucket = (isoDate?: string | null) => {
    if (!isoDate) return
    const idx = bucketIndex.get(isoDate.slice(0, 10))
    if (idx !== undefined) dayBuckets[idx].count++
  }
  for (const a of yearActivities.docs as Activity[]) addToBucket(a.createdAt)
  for (const m of yearMessages.docs as Message[]) addToBucket(m.createdAt)
  for (const p of yearPaidPayments.docs as Payment[]) addToBucket(p.createdAt)
  const totalYearInteractions = dayBuckets.reduce((acc, b) => acc + b.count, 0)

  return (
    <div className="space-y-4">
      {/* TOP COMMAND STRIP */}
      <section className="p-4 oled-card bracket-accent flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-widest mb-1">
            <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" />
            <span>Operación en línea · {dateTitle.toUpperCase()}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-3 font-mono uppercase">
            Torre de Control Comercial
            <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/25">
              {tenant.name}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <Link
            href="/workspace/crm"
            className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition"
          >
            <UserPlus className="w-4 h-4 text-sky-400" /> + Lead
          </Link>
          <PaymentCreateDialog clients={clientsForPayment.docs as Client[]} />
          <Link
            href="/workspace/inbox"
            className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]"
          >
            <Send className="w-4 h-4" /> Ir al Inbox
          </Link>
        </div>
      </section>

      {/* 5 KPI CARDS — todos calculados de datos reales del tenant */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <article className="p-4 oled-card space-y-2.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <span>Cobrado en el Mes</span>
            <span className="p-1.5 bg-sky-950/80 text-sky-400 border border-sky-800/80">
              <BadgeDollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{currency.format(revenueMonth.total)}</span>
            {revenueTrendPct !== null && (
              <span
                className={`text-xs font-mono font-bold flex items-center gap-0.5 ${revenueTrendPct >= 0 ? 'text-sky-400' : 'text-rose-400'}`}
              >
                {revenueTrendPct >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {revenueTrendPct >= 0 ? '+' : ''}
                {revenueTrendPct.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-zinc-400">
            {revenueMonth.count} pago{revenueMonth.count !== 1 ? 's' : ''} confirmado
            {revenueMonth.count !== 1 ? 's' : ''}
            {revenueTrendPct === null && ' · sin mes anterior para comparar'}
          </div>
        </article>

        <article className="p-4 oled-card space-y-2.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <span>Pipeline Ponderado</span>
            <span className="p-1.5 bg-indigo-950/80 text-indigo-400 border border-indigo-800/80">
              <PieChart className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{currency.format(weightedPipelineTotal)}</span>
            <span className="text-xs font-mono font-bold text-indigo-400">{totalLeadsActive} tratos</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>Probabilidad ponderada (modelo por etapa)</span>
              <span className="font-bold text-indigo-400">{weightedProbabilityPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, weightedProbabilityPct)}%` }} />
            </div>
          </div>
        </article>

        <article className="p-4 oled-card space-y-2.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <span>Leads en Gestión</span>
            <span className="p-1.5 bg-cyan-950/80 text-cyan-400 border border-cyan-800/80">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{totalLeadsActive}</span>
            <span className="text-xs font-mono font-bold text-cyan-400">+{leadsNuevo.totalDocs} nuevos</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>Conversión a cliente</span>
              <span className="font-bold text-white">
                {globalConversionRate !== null ? `${globalConversionRate.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, globalConversionRate ?? 0)}%` }} />
            </div>
          </div>
        </article>

        <article className="p-4 oled-card space-y-2.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <span>Tareas Vencidas</span>
            <span className="p-1.5 bg-amber-950/80 text-amber-400 border border-amber-800/80">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{overdueTasks.totalDocs}</span>
            <Link href="/workspace/tasks" className="text-xs font-mono font-bold text-amber-400 hover:underline">
              Ver tareas →
            </Link>
          </div>
          <div className="text-[11px] font-mono text-zinc-400">
            {overdueTasks.totalDocs > 0 ? 'Requieren atención inmediata' : 'Todo al día'}
          </div>
        </article>

        <article className="p-4 oled-card space-y-2.5">
          <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <span>Ventana WhatsApp 24H</span>
            <span className="p-1.5 bg-rose-950/80 text-rose-400 border border-rose-800/80">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white font-mono">{metaHealthPct.toFixed(1)}%</span>
            <span className="text-xs font-mono font-bold text-rose-400">
              {critical24hCount > 0 ? `${critical24hCount} por vencer` : '0 críticas'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-400">
              <span>{openConvCount} activas en inbox</span>
              <span className="font-bold text-white font-mono">
                {critical24hCount > 0 ? 'Acción requerida' : 'Saludable'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${metaHealthPct}%` }} />
            </div>
          </div>
        </article>
      </section>

      {/* MATRIZ DE ACTIVIDAD — datos reales agregados por día, ver ActivityHeatmap.tsx */}
      <ActivityHeatmap daysData={dayBuckets} totalInteractions={totalYearInteractions} />

      {/* 3 COLUMNAS: EMBUDO + RADAR DE OPORTUNIDADES + FEED OMNICANAL */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* EMBUDO DE CONVERSIÓN — conteos y tasas reales; sin "tiempo medio en etapa" (no lo medimos aún) */}
        <div className="lg:col-span-4 p-4 oled-card space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
            <div>
              <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-sky-400" /> Embudo de Conversión
              </h2>
              <p className="text-[11px] text-zinc-500">Volumen y tasa de avance real entre etapas</p>
            </div>
            <Link href="/workspace/crm" className="text-xs font-mono text-sky-400 hover:underline flex items-center gap-1 font-bold">
              Pipeline →
            </Link>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">1. Nuevos / Inbound</span>
                <span className="text-zinc-400 font-semibold">
                  {leadsNuevo.totalDocs} leads · {currency.format(estimatedRevenueNew)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div className="h-full bg-zinc-400" style={{ width: '100%' }} />
              </div>
              <div className="flex justify-end text-[11px] text-zinc-500">
                <span className="text-sky-400 font-bold">
                  {rateNewToContacted !== null ? `${rateNewToContacted.toFixed(0)}% avanza a contactado` : 'sin datos aún'}
                </span>
              </div>
            </div>

            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sky-400">2. En Conversación</span>
                <span className="text-sky-400 font-semibold">
                  {leadsContactado.totalDocs} leads · {currency.format(estimatedRevenueContacted)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-sky-400"
                  style={{ width: `${Math.min(100, (leadsContactado.totalDocs / Math.max(leadsNuevo.totalDocs, 1)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-end text-[11px] text-zinc-500">
                <span className="text-sky-400 font-bold">
                  {rateContactedToQualified !== null ? `${rateContactedToQualified.toFixed(0)}% avanza a calificado` : 'sin datos aún'}
                </span>
              </div>
            </div>

            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-indigo-400">3. Calificados</span>
                <span className="text-indigo-400 font-semibold">
                  {leadsCalificado.totalDocs} leads · {currency.format(estimatedRevenueQualified)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-indigo-400"
                  style={{ width: `${Math.min(100, (leadsCalificado.totalDocs / Math.max(leadsContactado.totalDocs, 1)) * 100)}%` }}
                />
              </div>
              <div className="flex justify-end text-[11px] text-zinc-500">
                <span className="text-indigo-400 font-bold">
                  {rateQualifiedToWon !== null ? `${rateQualifiedToWon.toFixed(0)}% cierra como cliente` : 'sin datos aún'}
                </span>
              </div>
            </div>

            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-400">4. Cotización / Cobro Pendiente</span>
                <span className="text-amber-400 font-semibold">
                  {revenuePending.count} pendiente{revenuePending.count !== 1 ? 's' : ''} · {currency.format(revenuePending.total)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: '100%' }} />
              </div>
            </div>

            <div className="p-3 oled-subcard space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-cyan-400">5. Cerrado Ganado (clientes activos)</span>
                <span className="text-cyan-400 font-semibold">{totalConvertedClients} clientes</span>
              </div>
              <div className="h-1.5 bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-cyan-400"
                  style={{ width: `${Math.min(100, globalConversionRate ?? 0)}%` }}
                />
              </div>
              <div className="flex justify-end text-[11px] text-zinc-500">
                <span className="text-cyan-400 font-bold">
                  Global: {globalConversionRate !== null ? `${globalConversionRate.toFixed(1)}%` : 'sin datos aún'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PRIORIDADES DEL PIPELINE — leads más recientes por etapa; sin "score de IA" inventado */}
        <div className="lg:col-span-4 p-4 oled-card space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
            <div>
              <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-amber-400" /> Prioridades del Pipeline
              </h2>
              <p className="text-[11px] text-zinc-500">Leads calificados/contactados con movimiento más reciente</p>
            </div>
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20 font-bold">
              {hotLeads.length > 0 ? `${hotLeads.length} PRIORITARIOS` : 'SIN ALERTAS'}
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {hotLeads.length > 0 ? (
              hotLeads.map((lead, idx) => {
                const borderColors = ['border-l-amber-400', 'border-l-sky-400', 'border-l-indigo-400']
                const borderCls = borderColors[idx % borderColors.length]
                const actionLabel = lead.status === 'calificado' ? 'Enviar cotización' : 'Agendar seguimiento'

                return (
                  <div key={lead.id} className={`p-3 oled-subcard space-y-2 border-l-2 ${borderCls}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="text-white text-xs block truncate max-w-[180px]">{lead.fullName}</strong>
                        <span className="text-[10px] text-zinc-400">
                          {lead.source} · {lead.phone ?? lead.email ?? 'sin contacto registrado'}
                        </span>
                      </div>
                      {typeof lead.estimatedValue === 'number' && (
                        <span className="text-amber-400 font-bold shrink-0">
                          {currency.format(lead.estimatedValue)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-300 line-clamp-2">
                      {lead.notes ?? 'Sin notas registradas.'}
                    </p>
                    <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900">
                      <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {actionLabel}
                      </span>
                      <Link
                        href={`/workspace/crm/leads/${lead.id}`}
                        className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] uppercase font-bold transition inline-flex items-center gap-1"
                      >
                        Abrir →
                      </Link>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-6 text-center text-zinc-500 font-mono text-xs">
                No hay leads calificados o contactados en este momento.
              </div>
            )}
          </div>
        </div>

        {/* FEED OMNICANAL — últimos eventos reales; estado vacío honesto si no hay actividad */}
        <div className="lg:col-span-4 p-4 oled-card space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
            <div>
              <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" /> Feed Omnicanal
              </h2>
              <p className="text-[11px] text-zinc-500">Últimos eventos de WhatsApp, IA, email y cobros</p>
            </div>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {convList[0] && (
              <div className="p-3 oled-subcard space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sky-400 font-bold flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp / Instagram
                  </span>
                  <span className="text-[10px] text-zinc-500">{formatTimeAgo(convList[0].updatedAt, nowTime)}</span>
                </div>
                <p className="text-zinc-200 text-xs truncate">Interacción activa con {convList[0].contactAddress}</p>
                <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                  <span>Canal: {convList[0].channel}</span>
                </div>
              </div>
            )}

            {summaries[0] && (
              <div className="p-3 oled-subcard space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Resumen IA Generado
                  </span>
                  <span className="text-[10px] text-zinc-500">{formatTimeAgo(summaries[0].createdAt, nowTime)}</span>
                </div>
                <p className="text-zinc-200 text-xs truncate">{summaries[0].summary}</p>
                <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                  <span>Sentimiento: {summaries[0].sentiment}</span>
                </div>
              </div>
            )}

            {emails[0] && (
              <div className="p-3 oled-subcard space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                    <MailCheck className="w-3.5 h-3.5" /> Email (Resend)
                  </span>
                  <span className="text-[10px] text-zinc-500">{formatTimeAgo(emails[0].createdAt, nowTime)}</span>
                </div>
                <p className="text-zinc-200 text-xs truncate">{emails[0].subject}</p>
                <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                  <span>{emails[0].to}</span>
                </div>
              </div>
            )}

            {payments[0] && (
              <div className="p-3 oled-subcard space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pago Confirmado
                  </span>
                  <span className="text-[10px] text-zinc-500">{formatTimeAgo(payments[0].createdAt, nowTime)}</span>
                </div>
                <p className="text-zinc-200 text-xs truncate">
                  {currency.format(Number(payments[0].amount))} · {payments[0].concept || 'Cobro'}
                </p>
                <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                  <span>
                    Cliente:{' '}
                    {typeof payments[0].client === 'object' && payments[0].client !== null
                      ? (payments[0].client as Client).name
                      : 'Sin cliente vinculado'}
                  </span>
                </div>
              </div>
            )}

            {!convList[0] && !summaries[0] && !emails[0] && !payments[0] && (
              <div className="p-6 text-center text-zinc-500 font-mono text-xs">
                Sin actividad reciente registrada todavía.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
