/**
 * OffersPage — `/workspace/offers`.
 * Suite comercial integral: Catálogo de Ofertas y Cotizaciones emitidas
 * con generador de presupuestos, envío por WhatsApp y facturación en 1 clic.
 */

import { getWorkspaceContext } from '@/lib/workspace-context'
import { OffersWorkspace } from '@/components/workspace/offers/OffersWorkspace'
import type { Client, Lead, Offer, Quote, Segment } from '@/payload-types'

export default async function OffersPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const queryParams = searchParams ? await searchParams : undefined
  const initialTab = queryParams?.tab === 'cotizaciones' ? 'cotizaciones' : 'catalogo'

  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [offersRes, segmentsRes, quotesRes, clientsRes, leadsRes] = await Promise.all([
    payload.find({
      collection: 'offers',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      pagination: false,
      sort: '-active',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'segments',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      pagination: false,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'quotes',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 500,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      limit: 300,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'leads',
      where: { tenant: { equals: tenantId }, status: { not_in: ['descartado'] } },
      depth: 0,
      limit: 300,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
  ])

  return (
    <OffersWorkspace
      canEdit={canEdit}
      tenantName={context.tenant.name}
      offers={offersRes.docs as Offer[]}
      segments={segmentsRes.docs as Segment[]}
      quotes={quotesRes.docs as Quote[]}
      clients={clientsRes.docs as Client[]}
      leads={leadsRes.docs as Lead[]}
      initialTab={initialTab}
    />
  )
}
