/**
 * OffersPage — `/workspace/offers`. Catálogo comercial del tenant:
 * ofertas con precio base, rubro asociado y estado activo. Antes solo
 * era accesible desde `/admin`.
 */

import { CircleDollarSign, PackageCheck, PackageX, Tag } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { toggleOfferActiveAction } from '@/lib/offer-actions'
import { OfferCreateDialog } from '@/components/workspace/OfferCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { Offer, Segment } from '@/payload-types'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export default async function OffersPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [offersRes, segmentsRes] = await Promise.all([
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
  ])
  const offers = offersRes.docs as Offer[]
  const segments = segmentsRes.docs as Segment[]

  const active = offers.filter((o) => o.active)
  const avgPrice = offers.length > 0 ? offers.reduce((acc, o) => acc + o.price, 0) / offers.length : 0

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Catálogo · ${context.tenant.name}`}
        title="Ofertas Comerciales"
        description="Servicios y planes que se cotizan a leads y clientes del tenant."
        actions={canEdit ? <OfferCreateDialog segments={segments.map((s) => ({ id: s.id, name: s.name }))} /> : undefined}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Ofertas activas" value={active.length} icon={PackageCheck} accent="sky" note={`${offers.length} en el catálogo`} />
        <KpiCard label="Precio promedio" value={usd.format(avgPrice)} icon={CircleDollarSign} accent="cyan" note="Base sin impuestos" />
        <KpiCard label="Pausadas" value={offers.length - active.length} icon={PackageX} accent="amber" note="No se cotizan ahora" />
      </section>

      <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {offers.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3">
            <OledCard>
              <EmptyState>Sin ofertas registradas para este tenant todavía.</EmptyState>
            </OledCard>
          </div>
        ) : (
          offers.map((o) => {
            const segmentName = typeof o.segment === 'object' && o.segment ? o.segment.name : null
            return (
              <article key={o.id} className="oled-card flex flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm font-bold text-white">{o.name}</strong>
                  <StatusBadge tone={o.active ? 'success' : 'neutral'}>{o.active ? 'Activa' : 'Pausada'}</StatusBadge>
                </div>
                {o.description && <p className="text-xs leading-relaxed text-zinc-400">{o.description}</p>}
                <div className="mt-auto flex items-center justify-between border-t border-zinc-900 pt-2.5">
                  <span className="flex items-center gap-1.5 text-lg font-black text-white font-mono">
                    <CircleDollarSign className="h-4 w-4 text-sky-400" />{usd.format(o.price)}
                  </span>
                  {segmentName && (
                    <span className="flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                      <Tag className="h-3 w-3" />{segmentName}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <form action={toggleOfferActiveAction} className="text-right">
                    <input type="hidden" name="id" value={o.id} />
                    <button type="submit" className="text-[10px] text-zinc-500 font-mono uppercase transition hover:text-white">
                      {o.active ? 'Pausar' : 'Activar'}
                    </button>
                  </form>
                )}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
