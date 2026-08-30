/**
 * BillingPage — `/workspace/billing`. Cobros, pendientes y facturación
 * del tenant activo.
 */

import Link from 'next/link'
import { Ban, CircleDollarSign, Clock3, FileText, Receipt, ShieldAlert } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/overview-data'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import { QuoteInvoiceCreateDialog } from '@/components/workspace/QuoteInvoiceCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, SectionHeader, StatusBadge } from '@/components/workspace/oled'
import type { Client, Invoice, Media, Offer, Quote } from '@/payload-types'

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

  const [collected, pending, overdue, cancelled, recent, clientsRes, offersRes, quotesRes, invoicesRes] = await Promise.all([
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonthIso()),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
    paymentsAggregate(payload, tenantId, ['vencido']),
    paymentsAggregate(payload, tenantId, ['anulado']),
    payload.find({
      collection: 'payments',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 20,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenantId }, stage: { equals: 'activo' } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'offers',
      where: { tenant: { equals: tenantId }, active: { equals: true } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'quotes',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 10,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'invoices',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 10,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
  ])

  const clients = clientsRes.docs as Client[]
  const offers = offersRes.docs as Offer[]
  const quotes = quotesRes.docs as Quote[]
  const invoices = invoicesRes.docs as Invoice[]

  function pdfUrl(doc: Quote | Invoice): string | null {
    const first = doc.generatedPdfs?.[0]
    if (first && typeof first === 'object') return (first as Media).url ?? null
    return null
  }

  const cards = [
    { label: 'Cobrado este mes', value: usd.format(collected.total), note: `${collected.count} pagos registrados`, icon: CircleDollarSign, accent: 'sky' as const },
    { label: 'Por cobrar', value: usd.format(pending.total), note: `${pending.count} cobros abiertos (pendiente + vencido)`, icon: Clock3, accent: 'amber' as const },
    { label: 'Vencidos', value: usd.format(overdue.total), note: `${overdue.count} pagos vencidos por gestionar`, icon: ShieldAlert, accent: 'rose' as const },
    { label: 'Anulados', value: usd.format(cancelled.total), note: `${cancelled.count} registros anulados`, icon: Ban, accent: 'indigo' as const },
  ]

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Ventas y cobranzas"
        title="Billing & Commerce"
        description={`Cobros, pendientes y facturación de ${context.tenant.name}.`}
        actions={
          canEdit ? (
            <>
              <QuoteInvoiceCreateDialog kind="quote" clients={clients} offers={offers} />
              <QuoteInvoiceCreateDialog kind="invoice" clients={clients} offers={offers} />
              <PaymentCreateDialog clients={clients} variant="primary" />
            </>
          ) : undefined
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de cobranza">
        {cards.map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} icon={card.icon} accent={card.accent} note={card.note} />
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <OledCard className="!p-0">
          <SectionHeader eyebrow="Ventas" title="Cotizaciones recientes" action={<FileText className="w-4 h-4 text-zinc-500 mr-4" />} />
          {quotes.length === 0 ? (
            <EmptyState>Sin cotizaciones registradas todavía.</EmptyState>
          ) : (
            <div className="flex flex-col">
              {quotes.map((q) => {
                const url = pdfUrl(q)
                return (
                  <div key={q.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <strong className="block truncate text-xs text-white">{q.quoteNumber || `Cotización #${q.id}`} · {q.client.name}</strong>
                      <span className="text-[10px] text-zinc-500 font-mono">{usd.format(q.total ?? 0)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge tone={q.status === 'accepted' ? 'success' : q.status === 'rejected' || q.status === 'expired' ? 'danger' : 'neutral'}>{q.status}</StatusBadge>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-400 hover:text-sky-300 font-mono">PDF →</a>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono">Sin PDF</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </OledCard>

        <OledCard className="!p-0">
          <SectionHeader eyebrow="Ventas" title="Facturas recientes" action={<Receipt className="w-4 h-4 text-zinc-500 mr-4" />} />
          {invoices.length === 0 ? (
            <EmptyState>Sin facturas registradas todavía.</EmptyState>
          ) : (
            <div className="flex flex-col">
              {invoices.map((inv) => {
                const url = pdfUrl(inv)
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <strong className="block truncate text-xs text-white">{inv.invoiceNumber || `Factura #${inv.id}`} · {inv.client.name}</strong>
                      <span className="text-[10px] text-zinc-500 font-mono">{usd.format(inv.total ?? 0)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' || inv.status === 'cancelled' ? 'danger' : 'neutral'}>{inv.status}</StatusBadge>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-400 hover:text-sky-300 font-mono">PDF →</a>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono">Sin PDF</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </OledCard>
      </section>

      <OledCard className="!p-0">
        <SectionHeader
          eyebrow="Cobranza"
          title="Cobros recientes"
          description="Últimos registros de pagos del tenant."
        />
        {recent.docs.length === 0 ? (
          <EmptyState>Sin pagos registrados para este tenant todavía.</EmptyState>
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
                        <StatusBadge tone={p.status === 'vencido' || p.status === 'anulado' ? 'danger' : p.status === 'pagado' ? 'success' : 'neutral'}>
                          {p.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{p.dueDate ? date.format(new Date(p.dueDate)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-between gap-4 border-t border-zinc-800 p-4 text-xs font-mono text-zinc-500">
          <span>{recent.docs.length} de {recent.totalDocs} cobros del tenant</span>
          <Link href="/workspace/analytics" className="text-zinc-400 hover:text-white">Ver métricas financieras →</Link>
        </footer>
      </OledCard>
    </div>
  )
}
