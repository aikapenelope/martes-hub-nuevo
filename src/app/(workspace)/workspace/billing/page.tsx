/**
 * BillingPage — `/workspace/billing`. Cobros, pendientes y facturación
 * del tenant activo.
 */

import Link from 'next/link'
import { Ban, CircleDollarSign, Clock3, Plus, ShieldAlert } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/overview-data'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId, canEdit } = context

  const [collected, pending, overdue, cancelled, recent] = await Promise.all([
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonthIso()),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
    paymentsAggregate(payload, tenantId, ['vencido']),
    paymentsAggregate(payload, tenantId, ['anulado']),
    payload.find({
      collection: 'payments',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 10,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
  ])

  const cards = [
    { label: 'Cobrado este mes', value: usd.format(collected.total), note: `${collected.count} pagos registrados`, icon: CircleDollarSign },
    { label: 'Por cobrar', value: usd.format(pending.total), note: `${pending.count} cobros abiertos (pendiente + vencido)`, icon: Clock3 },
    { label: 'Vencidos', value: usd.format(overdue.total), note: `${overdue.count} pagos vencidos por gestionar`, icon: ShieldAlert },
    { label: 'Anulados', value: usd.format(cancelled.total), note: `${cancelled.count} registros anulados`, icon: Ban },
  ]

  return (
    <>
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Ventas y cobranzas</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Billing &amp; Commerce</h1>
            <p className="mt-1 text-xs text-zinc-400">Cobros, pendientes y facturación de {context.tenant.name}.</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/collections/quotes/create" className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Plus size={16} /> Crear cotización
              </Link>
              <Link href="/admin/collections/invoices/create" className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Plus size={16} /> Nueva factura
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de cobranza">
        {cards.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">{label}</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{value}</p>
              </div>
              <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
                <Icon size={16} />
              </div>
            </div>
            <div className="mt-3 border-t border-zinc-800/80 pt-2.5 font-mono text-xs text-zinc-400">{note}</div>
          </article>
        ))}
      </section>

      <section className="border border-zinc-800 bg-zinc-950">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-bold text-white">Cobros recientes</h2>
            <p className="text-xs text-zinc-400">Últimos registros de pagos del tenant.</p>
          </div>
          <Link href="/admin/collections/payments" className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono">Ver todos</Link>
        </header>
        {recent.docs.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">Sin pagos registrados para este tenant todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Concepto</th>
                  <th className="px-4 py-2.5 font-medium">Monto</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">Vence</th>
                </tr>
              </thead>
              <tbody>
                {recent.docs.map((p) => {
                  const clientName = (() => {
                    if (p.client && typeof p.client === 'object') {
                      const populated = p.client as { name?: string; id?: number }
                      return populated.name || `Cliente #${populated.id ?? ''}`
                    }
                    return `Cliente #${String(p.client)}`
                  })()
                  return (
                    <tr key={p.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-4 py-3 text-white">{clientName}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.concept || '—'}</td>
                      <td className="px-4 py-3 font-bold text-white">{usd.format(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 ${p.status === 'vencido' || p.status === 'anulado' ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{p.dueDate ? date.format(new Date(p.dueDate)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
