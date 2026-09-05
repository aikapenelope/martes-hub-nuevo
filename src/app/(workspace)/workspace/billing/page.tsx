import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/overview-data'
import { BillingWorkspace } from '@/components/workspace/billing/BillingWorkspace'
import type { Client, Invoice, Offer, Payment, Quote } from '@/payload-types'
import { Ban, CircleDollarSign, Clock3, ShieldAlert } from 'lucide-react'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

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
      limit: 100,
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
      limit: 50,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'invoices',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 50,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
  ])

  const clients = clientsRes.docs as Client[]
  const offers = offersRes.docs as Offer[]
  const quotes = quotesRes.docs as Quote[]
  const invoices = invoicesRes.docs as Invoice[]
  const payments = recent.docs as Payment[]

  const cards = [
    { label: 'Cobrado este mes', value: usd.format(collected.total), note: `${collected.count} pagos registrados`, icon: CircleDollarSign, accent: 'sky' as const },
    { label: 'Por cobrar', value: usd.format(pending.total), note: `${pending.count} cobros abiertos (pendiente + vencido)`, icon: Clock3, accent: 'amber' as const },
    { label: 'Vencidos', value: usd.format(overdue.total), note: `${overdue.count} pagos vencidos por gestionar`, icon: ShieldAlert, accent: 'rose' as const },
    { label: 'Anulados', value: usd.format(cancelled.total), note: `${cancelled.count} registros anulados`, icon: Ban, accent: 'indigo' as const },
  ]

  return (
    <BillingWorkspace
      canEdit={canEdit}
      tenantName={context.tenant.name}
      timezone={context.tenant.timezone || 'America/Caracas'}
      clients={clients}
      offers={offers}
      quotes={quotes}
      invoices={invoices}
      payments={payments}
      cards={cards}
    />
  )
}

