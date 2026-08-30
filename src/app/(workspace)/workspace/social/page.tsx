/**
 * SocialPage — `/workspace/social`. Calendario editorial, publicaciones
 * y cuentas conectadas del tenant activo.
 */

import { Calendar, Share2, Radio, Clock, CheckCircle2, AlertCircle, Eye, Heart, TrendingUp } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getSocialMetricsSummary } from '@/lib/social-metrics-data'
import { SocialAccountCreateDialog } from '@/components/workspace/SocialAccountCreateDialog'
import { SocialPostCreateDialog } from '@/components/workspace/SocialPostCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, SectionHeader, StatusBadge } from '@/components/workspace/oled'
import type { SocialAccount, SocialPost } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId, canEdit, isAdmin } = context

  const [accountsRes, postsRes, metrics] = await Promise.all([
    payload.find({
      collection: 'social-accounts',
      where: { tenant: { equals: tenantId } },
      limit: 10,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'social-posts',
      where: { tenant: { equals: tenantId } },
      limit: 30,
      depth: 1,
      sort: '-scheduledAt',
      overrideAccess: false,
      user,
    }),
    getSocialMetricsSummary(payload, user, tenantId),
  ])

  const accounts = accountsRes.docs as SocialAccount[]
  const posts = postsRes.docs as SocialPost[]

  const now = new Date()
  const currentDayOfWeek = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - currentDayOfWeek)
  monday.setHours(0, 0, 0, 0)

  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const weekDays = dayNames.map((name, index) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + index)
    const dIsoPrefix = d.toISOString().split('T')[0]
    const dayPosts = posts.filter((p) => {
      const ref = p.scheduledAt || p.publishedAt || p.createdAt
      return ref && ref.startsWith(dIsoPrefix)
    })
    return {
      name,
      dayNum: d.getDate(),
      isToday: d.toDateString() === now.toDateString(),
      postsCount: dayPosts.length,
    }
  })

  const connectedAccountsCount = accounts.filter((a) => a.status === 'conectada').length
  const scheduledCount = posts.filter((p) => p.status === 'programado').length
  const publishedCount = posts.filter((p) => p.status === 'publicado').length

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Redes sociales y contenidos"
        title="Social Hub"
        description={`Calendario editorial, publicaciones y cuentas de ${context.tenant.name}.`}
        actions={
          canEdit ? (
            <>
              {isAdmin && <SocialAccountCreateDialog variant="cta" />}
              <SocialPostCreateDialog accounts={accounts} />
            </>
          ) : undefined
        }
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Indicadores sociales">
        <KpiCard label="Cuentas vinculadas" value={accounts.length} icon={Radio} accent="sky" note={`${connectedAccountsCount} activas y sincronizadas`} />
        <KpiCard label="Posts programados" value={scheduledCount} icon={Clock} accent="amber" note="Listos para publicar vía MCP" />
        <KpiCard label="Posts publicados" value={publishedCount} icon={CheckCircle2} accent="cyan" note="Publicados exitosamente" />
        <KpiCard label="Total histórico" value={posts.length} icon={Share2} accent="indigo" note="En el repositorio del tenant" />
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-label="Desempeño real de publicaciones">
        <KpiCard
          label="Alcance total"
          value={metrics.totals.reach.toLocaleString('es')}
          icon={TrendingUp}
          accent="sky"
          note={metrics.postsWithMetrics > 0 ? `${metrics.postsWithMetrics} posts con métricas` : 'Sin métricas registradas todavía'}
        />
        <KpiCard label="Impresiones" value={metrics.totals.impressions.toLocaleString('es')} icon={Eye} accent="indigo" note="Suma de la última medición por post" />
        <KpiCard label="Interacciones" value={(metrics.totals.likes + metrics.totals.comments).toLocaleString('es')} icon={Heart} accent="rose" note="Likes + comentarios" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_.8fr]">
        <div className="flex flex-col gap-4">
          <OledCard>
            <SectionHeader eyebrow="Calendario semanal" title="Distribución de publicaciones" action={<Calendar size={18} className="text-zinc-500" />} />
            <div className="grid grid-cols-7 gap-2 text-center">
              {weekDays.map((day) => (
                <div key={day.name} className={day.isToday ? 'border border-white bg-zinc-900 p-3' : 'oled-subcard p-3'}>
                  <div className="text-[10px] text-zinc-500 font-mono">{day.name}</div>
                  <div className="mt-1 text-lg font-bold text-white">{day.dayNum}</div>
                  {day.postsCount > 0 ? (
                    <span className="mt-1 inline-block text-[9px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-200 border border-zinc-700">
                      {day.postsCount} post{day.postsCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[9px] text-zinc-600">—</span>
                  )}
                </div>
              ))}
            </div>
          </OledCard>

          <OledCard>
            <SectionHeader eyebrow="Editorial" title="Publicaciones recientes y programadas" />
            {posts.length === 0 ? (
              <EmptyState>No hay publicaciones registradas para este tenant todavía.</EmptyState>
            ) : (
              <div className="flex flex-col">
                {posts.map((p) => {
                  const accountObj = typeof p.account === 'object' && p.account ? (p.account as SocialAccount) : null
                  const accountLabel = accountObj?.accountName || 'Cuenta Social'
                  const dateStr = p.scheduledAt || p.publishedAt || p.createdAt
                  const snap = metrics.latestByPost.get(p.id)
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 py-2.5 last:border-0">
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-white">{p.caption.slice(0, 80)}{p.caption.length > 80 ? '…' : ''}</strong>
                        <span className="text-[10px] text-zinc-500 font-mono">{accountLabel} · {dateStr ? dateFmt.format(new Date(dateStr)) : 'Sin fecha'}</span>
                        {snap && (
                          <span className="mt-0.5 flex items-center gap-2.5 text-[10px] text-zinc-400 font-mono">
                            <span className="inline-flex items-center gap-1"><Eye size={10} /> {snap.reach.toLocaleString('es')}</span>
                            <span className="inline-flex items-center gap-1"><Heart size={10} /> {snap.likes.toLocaleString('es')}</span>
                            <span>{snap.comments} comentarios</span>
                          </span>
                        )}
                      </div>
                      <StatusBadge tone={p.status === 'fallido' ? 'danger' : p.status === 'publicado' ? 'success' : 'neutral'}>
                        {p.status}
                      </StatusBadge>
                    </div>
                  )
                })}
              </div>
            )}
          </OledCard>
        </div>

        <OledCard>
          <SectionHeader
            eyebrow="Integración"
            title="Cuentas vinculadas"
            action={canEdit && isAdmin ? <SocialAccountCreateDialog variant="button" /> : undefined}
          />
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-zinc-500">
              <AlertCircle size={22} />
              <div>Sin cuentas sociales conectadas.</div>
              {canEdit && isAdmin ? <SocialAccountCreateDialog variant="cta" /> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map((acc) => (
                <div key={acc.id} className="oled-subcard flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-xs font-semibold text-white">{acc.accountName}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{acc.platform === 'instagram' ? 'Instagram Business' : 'Facebook Page'}</div>
                  </div>
                  <StatusBadge tone={acc.status === 'conectada' ? 'success' : 'danger'}>● {acc.status.toUpperCase()}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </OledCard>
      </section>
    </div>
  )
}
