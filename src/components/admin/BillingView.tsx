/**
 * BillingView — Payload custom admin view registrada en `/admin/billing`.
 *
 * Puerto de la antigua página `(workspace)/billing/page.tsx`. `searchParams`
 * llega como objeto plano desde Payload; se acepta también como Promise por
 * compatibilidad con el patrón de Server Components de Next.js.
 */

import 'server-only'

import Link from 'next/link'
import { Ban, CircleDollarSign, Clock3, Plus, ShieldAlert } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/overview-data'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

interface BillingViewProps {
  searchParams?: { tenant?: string | string[] } | Promise<{ tenant?: string | string[] }>
}

export async function BillingView({ searchParams }: BillingViewProps = {}) {
  const params = (await searchParams) ?? {}
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
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow"><span className="workspace-eyebrow-dot" /> Ventas y cobranzas</div>
          <h1 className="workspace-title">Billing & Commerce</h1>
          <p className="workspace-subtitle">Cobros, pendientes y facturación de {context.tenant.name}.</p>
        </div>
        {canEdit ? (
          <div className="workspace-actions">
            <Link className="workspace-button" href="/admin/collections/quotes/create"><Plus size={16} /> Crear cotización</Link>
            <Link className="workspace-button workspace-button-primary" href="/admin/collections/invoices/create"><Plus size={16} /> Nueva factura</Link>
          </div>
        ) : null}
      </section>

      <section className="workspace-kpis" aria-label="Indicadores de cobranza">
        {cards.map(({ label, value, note, icon: Icon }) => (
          <article className="workspace-card workspace-kpi" key={label}>
            <div className="workspace-kpi-top"><span className="workspace-kpi-label">{label}</span><span className="workspace-kpi-icon"><Icon size={18} /></span></div>
            <div className="workspace-kpi-value">{value}</div>
            <div className="workspace-kpi-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="workspace-card crm-table-card" style={{ marginTop: '1rem' }}>
        <header className="workspace-card-head">
          <div><h2 className="workspace-card-title">Cobros recientes</h2><p className="workspace-card-description">Últimos registros de pagos del tenant.</p></div>
          <Link className="workspace-button" href="/admin/collections/payments">Ver todos</Link>
        </header>
        {recent.docs.length === 0 ? (
          <div className="workspace-empty">Sin pagos registrados para este tenant todavía.</div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Vence</th>
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
                    <tr key={p.id}>
                      <td data-label="Cliente">{clientName}</td>
                      <td data-label="Concepto">{p.concept || '—'}</td>
                      <td data-label="Monto"><strong>{usd.format(p.amount)}</strong></td>
                      <td data-label="Estado">
                        <span className="workspace-badge" data-tone={p.status === 'vencido' || p.status === 'anulado' ? 'danger' : undefined}>{p.status}</span>
                      </td>
                      <td data-label="Vence">{p.dueDate ? date.format(new Date(p.dueDate)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
