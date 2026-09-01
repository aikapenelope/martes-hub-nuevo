/**
 * MembershipsPage — `/workspace/memberships`. Antes esta colección solo
 * era accesible desde `/admin`; ahora tiene su propia vista dentro del
 * workspace, con la misma UI OLED del resto del producto.
 */

import { AlertTriangle, CalendarClock, CircleDollarSign, RefreshCw } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { MembershipCreateDialog } from '@/components/workspace/MembershipCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import { MembershipStatusSelect } from '@/components/workspace/MembershipStatusSelect'
import type { Client, Membership } from '@/payload-types'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_TONE: Record<Membership['status'] & string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  activa: 'success',
  pausada: 'warning',
  vencida: 'danger',
  cancelada: 'neutral',
}

export default async function MembershipsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [membershipsRes, clientsRes] = await Promise.all([
    payload.find({
      collection: 'memberships',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 200,
      sort: 'renewalDate',
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
  ])

  const memberships = membershipsRes.docs as Membership[]
  const clients = clientsRes.docs as Client[]

  const now = new Date().getTime()
  const in7Days = now + 7 * 24 * 3600_000

  const active = memberships.filter((m) => m.status === 'activa')
  const renewingSoon = active.filter((m) => {
    const t = new Date(m.renewalDate).getTime()
    return t >= now && t <= in7Days
  })
  const overdue = memberships.filter((m) => m.status === 'vencida')
  const mrr = active.reduce((acc, m) => acc + m.monthlyPrice, 0)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Membresías · ${context.tenant.name}`}
        title="Membresías y Suscripciones"
        description="Planes recurrentes, renovaciones y MRR del tenant activo."
        actions={canEdit ? <MembershipCreateDialog clients={clients} /> : undefined}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="MRR activo" value={usd.format(mrr)} icon={CircleDollarSign} accent="sky" note={`${active.length} membresías activas`} />
        <KpiCard label="Renuevan en 7 días" value={renewingSoon.length} icon={CalendarClock} accent="amber" note="Contactar antes del vencimiento" />
        <KpiCard label="Vencidas" value={overdue.length} icon={AlertTriangle} accent="rose" note="Requieren seguimiento inmediato" />
        <KpiCard label="Total histórico" value={memberships.length} icon={RefreshCw} accent="indigo" note="Todas las membresías del tenant" />
      </section>

      <OledCard className="!p-0">
        {memberships.length === 0 ? (
          <EmptyState>Sin membresías registradas para este tenant todavía.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Mensual</th>
                  <th className="px-4 py-2.5 font-medium">Renueva</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => {
                  const clientName = typeof m.client === 'object' && m.client ? (m.client as Client).name : `Cliente #${m.client}`
                  const renewalSoon = m.status === 'activa' && new Date(m.renewalDate).getTime() <= in7Days
                  return (
                    <tr key={m.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-4 py-3 text-white">{clientName}</td>
                      <td className="px-4 py-3 text-zinc-400">{m.plan}</td>
                      <td className="px-4 py-3 font-bold text-white">{usd.format(m.monthlyPrice)}</td>
                      <td className={`px-4 py-3 ${renewalSoon ? 'text-amber-400 font-bold' : 'text-zinc-400'}`}>
                        {date.format(new Date(m.renewalDate))}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <MembershipStatusSelect
                            membershipId={m.id}
                            status={m.status ?? 'activa'}
                            label={`Cambiar estado de membresía de ${clientName}`}
                          />
                        ) : (
                          <StatusBadge tone={STATUS_TONE[m.status ?? 'activa']}>{m.status}</StatusBadge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </OledCard>
    </div>
  )
}
