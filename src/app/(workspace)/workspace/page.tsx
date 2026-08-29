/**
 * WorkspacePage — vista de inicio del workspace (`/workspace`), estilo
 * Storelink: hero, KPIs, embudo CRM, cobros recientes y mini CRM. Es la
 * misma UI que se había portado a `/admin/analytics`; ahora vive en el
 * workspace en vez de dentro del admin nativo de Payload.
 */

import 'server-only'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Send,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/db-aggregates'
import type { Client, Lead, Payment } from '@/payload-types'
import type { Where } from 'payload'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600_000).toISOString()
}

/** Últimos `n` días de más antiguo a más reciente, con etiqueta en español. */
function buildDayBuckets(n: number): { dateStr: string; label: string; amount: number }[] {
  const LABELS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.now() - (n - 1 - i) * 24 * 3600_000)
    return {
      dateStr: d.toISOString().slice(0, 10),
      label: LABELS[d.getDay()],
      amount: 0,
    }
  })
}

function clientName(client: Payment['client']): string {
  if (typeof client === 'object' && client !== null) return (client as Client).name ?? '—'
  return '—'
}

export default async function WorkspacePage() {
  const { payload, tenant, tenantId, user } = await getWorkspaceContext()

  const tenantFilter = (extra?: Where): Where => ({
    and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
  })

  const q = <T extends Parameters<typeof payload.find>[0]>(opts: T) =>
    payload.find({ ...opts, overrideAccess: false, user } as T)

  const now = new Date()
  const sevenDaysAgo = daysAgoIso(7)
  const startOfMonth = startOfMonthIso()
  const dateTitle = now
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^\w/, (c) => c.toUpperCase())

  const [
    leadsNuevo,
    leadsContactado,
    leadsCalificado,
    leadsDescartado,
    clientsActive,
    overduePayments,
    recentPayments,
    recentLeads,
    recentClients,
    revenueMonth,
    revenuePending,
  ] = await Promise.all([
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'nuevo' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'contactado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'calificado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'descartado' } }) }),
    q({ collection: 'clients', limit: 0, where: tenantFilter({ stage: { equals: 'activo' } }) }),
    q({ collection: 'payments', limit: 6, sort: '-dueDate', depth: 1, where: tenantFilter({ status: { equals: 'vencido' } }) }),
    q({ collection: 'payments', limit: 8, sort: '-createdAt', depth: 1, where: tenantFilter() }),
    q({ collection: 'leads', limit: 50, sort: '-createdAt', depth: 0, where: tenantFilter({ createdAt: { greater_than_equal: sevenDaysAgo } }) }),
    q({ collection: 'clients', limit: 5, sort: '-updatedAt', depth: 0, where: tenantFilter({ stage: { equals: 'activo' } }) }),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonth),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
  ])

  const totalLeadsActive =
    leadsNuevo.totalDocs + leadsContactado.totalDocs + leadsCalificado.totalDocs
  const funnelBase = totalLeadsActive + clientsActive.totalDocs

  const dayBuckets = buildDayBuckets(7)
  for (const lead of recentLeads.docs as Lead[]) {
    const dateStr = (lead.createdAt as string).slice(0, 10)
    const bucket = dayBuckets.find((b) => b.dateStr === dateStr)
    if (bucket) bucket.amount++
  }
  const maxDay = Math.max(...dayBuckets.map((d) => d.amount), 1)

  const payments = recentPayments.docs as Payment[]
  const overdue = overduePayments.docs as Payment[]
  const clients = recentClients.docs as Client[]

  const statusCfg: Record<string, { label: string; cls: string }> = {
    pagado: {
      label: 'Pagado',
      cls: 'bg-emerald-900/50 text-emerald-400 border border-emerald-800',
    },
    pendiente: {
      label: 'Pendiente',
      cls: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    },
    vencido: {
      label: 'Vencido',
      cls: 'bg-red-900/50 text-red-400 border border-red-800',
    },
    anulado: {
      label: 'Anulado',
      cls: 'bg-zinc-900 text-zinc-500 border border-zinc-800',
    },
  }

  return (
    <>
      {/* Hero */}
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Operación en línea · {dateTitle}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{tenant.name}</h1>
            <p className="mt-1 text-xs text-zinc-400">
              CRM, cobros, leads y actividad comercial del equipo
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/workspace/crm"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
            >
              + Nuevo Lead
            </Link>
            <Link
              href="/admin/collections/payments/create"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
            >
              + Registrar Cobro
            </Link>
            <Link
              href="/workspace/hoy"
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 shadow-lg uppercase tracking-wider font-mono"
            >
              Ver Seguimientos →
            </Link>
          </div>
        </div>
      </section>

      {/* 4 KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">
                Cobrado este mes
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">
                {currency.format(revenueMonth.total)}
              </p>
            </div>
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
            <span className="font-mono text-xs text-zinc-400">
              {revenueMonth.count} pago{revenueMonth.count !== 1 ? 's' : ''} confirmado{revenueMonth.count !== 1 ? 's' : ''}
            </span>
          </div>
        </article>

        <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">
                Por cobrar
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">
                {currency.format(revenuePending.total)}
              </p>
            </div>
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
            <span className="font-mono text-xs text-zinc-400">
              {revenuePending.count} cobro{revenuePending.count !== 1 ? 's' : ''} pendiente{revenuePending.count !== 1 ? 's' : ''}
            </span>
            <Link
              href="/workspace/billing"
              className="text-xs font-mono text-white bg-zinc-900 border border-zinc-700 px-1.5 py-0.5"
            >
              Ver →
            </Link>
          </div>
        </article>

        <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">
                Leads activos
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">
                {totalLeadsActive}
              </p>
            </div>
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
            <span className="font-mono text-xs text-zinc-400">
              {leadsDescartado.totalDocs} descartados
            </span>
            <Link
              href="/workspace/crm"
              className="text-xs font-mono text-white bg-zinc-900 border border-zinc-700 px-1.5 py-0.5"
            >
              Pipeline →
            </Link>
          </div>
        </article>

        <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">
                Clientes activos
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">
                {clientsActive.totalDocs}
              </p>
            </div>
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
            <span className="font-mono text-xs text-zinc-400">
              {funnelBase > 0
                ? `${Math.round((clientsActive.totalDocs / funnelBase) * 100)}% conversión`
                : '—'}
            </span>
            <Link
              href="/workspace/crm"
              className="text-xs font-mono text-white bg-zinc-900 border border-zinc-700 px-1.5 py-0.5"
            >
              CRM →
            </Link>
          </div>
        </article>
      </section>

      {/* Alerta: cobros vencidos */}
      {overdue.length > 0 && (
        <section className="border border-red-900/50 bg-zinc-950 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 border border-red-900 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {overdue.length} cobro{overdue.length !== 1 ? 's' : ''} vencido
                {overdue.length !== 1 ? 's' : ''} — requieren seguimiento
              </p>
              <p className="text-xs text-zinc-400">
                Actualiza el estado o coordina el pago con el cliente.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {overdue.map((p) => (
              <Link
                key={p.id}
                href={`/admin/collections/payments/${p.id}`}
                className="px-2.5 py-1 bg-zinc-900 border border-red-900/60 hover:border-red-700 text-xs text-zinc-200 flex items-center gap-1.5 transition font-mono"
              >
                <span>{clientName(p.client)}</span>
                <b className="text-red-400">{currency.format(Number(p.amount))}</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Chart + Funnel */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                Actividad · últimos 7 días
              </p>
              <h2 className="text-base font-bold text-white">Leads creados</h2>
            </div>
            <Link
              href="/workspace/crm"
              className="text-xs text-zinc-400 hover:text-white font-mono transition"
            >
              Ver pipeline →
            </Link>
          </div>
          <div className="flex h-48 items-end gap-2 border-b border-l border-zinc-800 px-2 pb-0 pt-4 sm:gap-4">
            {dayBuckets.map((bar, idx) => {
              const heightPercent = Math.max(
                Math.round((bar.amount / maxDay) * 100),
                8,
              )
              const isToday = idx === dayBuckets.length - 1
              return (
                <div
                  key={bar.dateStr}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                >
                  <div
                    className="w-full max-w-10 transition-all duration-300"
                    style={{
                      height: `${heightPercent}%`,
                      backgroundColor: isToday
                        ? '#ffffff'
                        : bar.amount > 0
                          ? '#52525b'
                          : '#18181b',
                    }}
                  />
                  <span
                    className={`font-mono text-[10px] ${isToday ? 'text-white font-bold' : 'text-zinc-500'}`}
                  >
                    {bar.label}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-white" />
              <strong className="text-white font-semibold">
                {recentLeads.totalDocs} leads esta semana
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-zinc-500" />
              <strong className="text-zinc-300">Total activos: {totalLeadsActive}</strong>
            </span>
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                Pipeline
              </p>
              <h2 className="text-base font-bold text-white">Embudo CRM</h2>
            </div>
            <Link
              href="/workspace/crm"
              className="text-xs text-zinc-400 hover:text-white font-mono transition"
            >
              Ver leads →
            </Link>
          </div>
          <div className="space-y-3">
            {(
              [
                {
                  label: 'Nuevo',
                  count: leadsNuevo.totalDocs,
                  href: '/workspace/crm?vista=leads&estado=nuevo',
                },
                {
                  label: 'Contactado',
                  count: leadsContactado.totalDocs,
                  href: '/workspace/crm?vista=leads&estado=contactado',
                },
                {
                  label: 'Calificado',
                  count: leadsCalificado.totalDocs,
                  href: '/workspace/crm?vista=leads&estado=calificado',
                },
                {
                  label: 'Convertido',
                  count: clientsActive.totalDocs,
                  href: '/workspace/crm?vista=clientes',
                },
              ] as const
            ).map(({ label, count, href }) => {
              const barPercent =
                funnelBase > 0
                  ? Math.max(Math.round((count / funnelBase) * 100), count > 0 ? 6 : 0)
                  : 0
              return (
                <Link key={label} href={href} className="flex items-center gap-3 group">
                  <span className="w-20 font-mono text-xs text-zinc-400 shrink-0 group-hover:text-white transition">
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="h-1.5 bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-300"
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className="font-mono text-xs text-zinc-300 font-semibold shrink-0 w-7 text-right">
                    {count}
                  </span>
                </Link>
              )
            })}
          </div>
          {funnelBase > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-4 text-xs font-mono text-zinc-400">
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-0.5">Conversión</div>
                <div className="font-bold text-white">
                  {Math.round((clientsActive.totalDocs / funnelBase) * 100)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-0.5">En pipeline</div>
                <div className="font-bold text-white">{totalLeadsActive}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-0.5">Descartados</div>
                <div className="font-bold text-zinc-500">{leadsDescartado.totalDocs}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Bottom: cobros recientes + mini CRM */}
      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                Finanzas
              </p>
              <h2 className="text-base font-bold text-white">Cobros recientes</h2>
            </div>
            <Link
              href="/workspace/billing"
              className="text-xs text-zinc-400 hover:text-white font-mono transition inline-flex items-center gap-1"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1">
            {payments.length > 0 ? (
              payments.map((p) => {
                const cfg = statusCfg[p.status ?? 'pendiente'] ?? statusCfg.pendiente
                const due = p.dueDate
                  ? new Date(p.dueDate as string).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                    })
                  : '—'
                const cName = clientName(p.client)
                return (
                  <Link
                    key={p.id}
                    href={`/admin/collections/payments/${p.id}`}
                    className="flex items-center gap-3 border-b border-zinc-800/60 py-2.5 last:border-0 hover:bg-zinc-900/40 px-1 -mx-1 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {p.concept || cName}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {cName} · vence {due}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-white">
                        {currency.format(Number(p.amount))}
                      </span>
                    </div>
                  </Link>
                )
              })
            ) : (
              <div className="text-center py-8 text-xs text-zinc-500 font-mono">
                Sin cobros registrados todavía.
              </div>
            )}
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                Mini CRM
              </p>
              <h2 className="text-base font-bold text-white">Clientes activos</h2>
            </div>
            <Link
              href="/workspace/crm?vista=clientes"
              className="text-xs text-zinc-400 hover:text-white font-mono transition"
            >
              Abrir CRM →
            </Link>
          </div>
          <div className="space-y-1">
            {clients.length > 0 ? (
              clients.map((c) => {
                const initials = (c.name ?? '?')
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
                const cleanPhone = (c.phone ?? '').replace(/\D/g, '')
                const waMsg = encodeURIComponent(
                  `¡Hola ${c.name}! Te escribimos de ${tenant.name}. ¿Cómo estás?`,
                )
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 border-b border-zinc-800/60 py-2.5 last:border-0"
                  >
                    <span className="w-7 h-7 bg-white text-black font-extrabold text-xs flex items-center justify-center shrink-0 font-mono">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">Activo</p>
                    </div>
                    {cleanPhone ? (
                      <a
                        href={`https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : `58${cleanPhone}`}?text=${waMsg}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-mono transition inline-flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3 h-3 shrink-0" />
                        <span>WA</span>
                      </a>
                    ) : null}
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-xs text-zinc-500 font-mono">
                Sin clientes activos todavía.
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
