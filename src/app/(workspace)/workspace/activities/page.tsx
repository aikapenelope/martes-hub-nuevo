/**
 * ActivitiesPage — `/workspace/activities`. Timeline comercial unificado
 * del tenant: llamadas, WhatsApp, emails, reuniones y notas sobre
 * leads/clientes. Antes solo era visible desde `/admin`.
 */

import Link from 'next/link'
import type { Where } from 'payload'
import { Activity, Mail, MessageSquare, PhoneCall, StickyNote, Users } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { EmptyState, KpiCard, OledCard, PageHero } from '@/components/workspace/oled'
import type { Activity as ActivityDoc } from '@/payload-types'

const TYPE_META: Record<ActivityDoc['type'], { label: string; icon: typeof Activity; cls: string }> = {
  llamada: { label: 'Llamada', icon: PhoneCall, cls: 'text-sky-400 border-sky-800 bg-sky-950/60' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, cls: 'text-emerald-400 border-emerald-800 bg-emerald-950/60' },
  email: { label: 'Email', icon: Mail, cls: 'text-indigo-400 border-indigo-800 bg-indigo-950/60' },
  reunion: { label: 'Reunión', icon: Users, cls: 'text-amber-300 border-amber-800 bg-amber-950/60' },
  nota: { label: 'Nota', icon: StickyNote, cls: 'text-zinc-300 border-zinc-700 bg-zinc-900' },
  otro: { label: 'Otro', icon: Activity, cls: 'text-zinc-400 border-zinc-700 bg-zinc-900' },
}

const datetime = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const RELATION_ORDER = ['reunion', 'llamada', 'whatsapp', 'email', 'nota', 'otro'] as const

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const { tipo } = await searchParams
  const context = await getWorkspaceContext()
  const { payload, user, tenantId } = context

  const validType = tipo && tipo in TYPE_META ? (tipo as ActivityDoc['type']) : null
  const where: Where = validType
    ? { and: [{ tenant: { equals: tenantId } }, { type: { equals: validType } }] }
    : { tenant: { equals: tenantId } }

  const [activitiesRes, monthCounts] = await Promise.all([
    payload.find({
      collection: 'activities',
      where,
      depth: 1,
      limit: 100,
      sort: '-occurredAt',
      overrideAccess: false,
      user,
    }),
    payload.count({
      collection: 'activities',
      where: { and: [{ tenant: { equals: tenantId } }, { occurredAt: { greater_than_equal: startOfMonthIso() } }] },
      overrideAccess: false,
      user,
    }),
  ])
  const activities = activitiesRes.docs as ActivityDoc[]

  const byType = new Map<string, number>()
  for (const a of activities) byType.set(a.type, (byType.get(a.type) ?? 0) + 1)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Historial · ${context.tenant.name}`}
        title="Actividades Comerciales"
        description="Timeline unificado de contactos con leads y clientes."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Actividades del mes" value={monthCounts.totalDocs} icon={Activity} accent="sky" note="Llamadas + chats + reuniones" />
        {RELATION_ORDER.filter((t) => byType.has(t)).slice(0, 3).map((t) => {
          const meta = TYPE_META[t as ActivityDoc['type']]
          return <KpiCard key={t} label={meta.label} value={byType.get(t) ?? 0} icon={meta.icon} accent="indigo" note="En las últimas 100" />
        })}
      </section>

      <div className="flex flex-wrap gap-1.5">
        <FilterPill label="Todas" href="/workspace/activities" active={!validType} />
        {RELATION_ORDER.map((t) => (
          <FilterPill key={t} label={TYPE_META[t].label} href={`/workspace/activities?tipo=${t}`} active={validType === t} />
        ))}
      </div>

      <OledCard className="!p-0">
        {activities.length === 0 ? (
          <EmptyState>Sin actividades registradas{validType ? ` del tipo «${TYPE_META[validType].label}»` : ''}.</EmptyState>
        ) : (
          <ol className="flex flex-col">
            {activities.map((a) => {
              const meta = TYPE_META[a.type]
              const Icon = meta.icon
              const client = typeof a.client === 'object' ? a.client : null
              const lead = typeof a.lead === 'object' ? a.lead : null
              const agent = typeof a.performedBy === 'object' ? a.performedBy : null
              return (
                <li key={a.id} className="flex gap-3 border-b border-zinc-900 px-4 py-3 last:border-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${meta.cls}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-xs font-mono uppercase text-white">{meta.label}</strong>
                      <span className="text-[10px] font-mono text-zinc-500">{datetime.format(new Date(a.occurredAt))}</span>
                      {agent && <span className="text-[10px] font-mono text-zinc-500">· {agent.firstName ?? agent.email}</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-zinc-200">{a.summary}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono">
                      {client && (
                        <Link href="/workspace/crm" className="text-emerald-400 hover:text-emerald-300">
                          Cliente: {client.name} →
                        </Link>
                      )}
                      {lead && (
                        <Link href="/workspace/crm" className="text-sky-400 hover:text-sky-300">
                          Lead: {lead.fullName} →
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </OledCard>
    </div>
  )
}

function FilterPill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-1 text-[11px] font-mono uppercase transition ${active ? 'bg-white text-black' : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white'}`}
    >
      {label}
    </Link>
  )
}

function startOfMonthIso(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}
