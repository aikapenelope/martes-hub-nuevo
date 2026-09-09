/**
 * SocialPage — `/workspace/social`. Calendario editorial, publicaciones
 * y cuentas conectadas del tenant activo.
 */

import { Calendar, Share2, Radio, Clock, CheckCircle2, AlertCircle, Eye, Heart, TrendingUp } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { getSocialMetricsSummary } from '@/lib/social-metrics-data'
import { SocialAccountCreateDialog } from '@/components/workspace/SocialAccountCreateDialog'
import { SocialPostCreateDialog } from '@/components/workspace/SocialPostCreateDialog'
import { SocialWeekCalendar } from '@/components/workspace/social/SocialWeekCalendar'
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

  const [accountsRes, postsRes, metrics, accountMetricsRes] = await Promise.all([
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
    payload.find({
      collection: 'social-account-metrics',
      where: { tenant: { equals: tenantId } },
      limit: 1,
      depth: 0,
      sort: '-recordedAt',
      overrideAccess: false,
      user,
    }),
  ])

  const accounts = accountsRes.docs as SocialAccount[]
  const posts = postsRes.docs as SocialPost[]

  const now = new Date()
  const currentDayOfWeek = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - currentDayOfWeek)
  monday.setHours(0, 0, 0, 0)

  const connectedAccountsCount = accounts.filter((a) => a.status === 'conectada').length
  const scheduledCount = posts.filter((p) => p.status === 'programado').length
  const publishedCount = posts.filter((p) => p.status === 'publicado').length

  // Espejo de Instagram Insights: posts publicados con métricas, top por alcance.
  const topPosts = posts
    .filter((p) => p.status === 'publicado' && metrics.latestByPost.has(p.id))
    .map((p) => ({ post: p, snap: metrics.latestByPost.get(p.id)! }))
    .sort((a, b) => b.snap.reach - a.snap.reach)
    .slice(0, 10)

  const hasInstagram = accounts.some((a) => a.platform === 'instagram' && a.status === 'conectada')

  function mediaThumb(post: SocialPost): string | null {
    const media = Array.isArray(post.media) ? post.media[0] : null
    if (!media || typeof media !== 'object') return null
    const sizes = (media as { sizes?: Record<string, { url?: string | null }> | null }).sizes
    return sizes?.thumbnail?.url ?? (media as { url?: string | null }).url ?? null
  }

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
        <KpiCard label="Posts programados" value={scheduledCount} icon={Clock} accent="amber" note="Listos para publicar vía Composio" />
        <KpiCard label="Posts publicados" value={publishedCount} icon={CheckCircle2} accent="cyan" note="Publicados exitosamente" />
        <KpiCard label="Total histórico" value={posts.length} icon={Share2} accent="indigo" note="En el repositorio del tenant" />
      </section>

      <section aria-label="Desempeño por post — espejo de Instagram Insights">
        <OledCard>
          <SectionHeader eyebrow="Espejo de Instagram Insights" title="Desempeño por publicación" action={<TrendingUp size={18} className="text-zinc-500" />} />
          {!hasInstagram ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-zinc-500">
              <AlertCircle size={22} />
              <div>
                Conecta la cuenta de Instagram del negocio en{' '}
                <a href="/workspace/settings#conexiones" className="underline text-zinc-300">
                  Ajustes → Conexiones
                </a>{' '}
                para ver alcance, guardados y más.
              </div>
            </div>
          ) : topPosts.length === 0 ? (
            <EmptyState>
              Aún no hay métricas — el job diario trae alcance/interacciones de cada post publicado.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider font-mono text-zinc-500">
                    <th className="py-2 pr-3">Post</th>
                    <th className="py-2 pr-3">Alcance</th>
                    <th className="py-2 pr-3">Me gusta</th>
                    <th className="py-2 pr-3">Comentarios</th>
                    <th className="py-2 pr-3">Guardados</th>
                    <th className="py-2 pr-3">ER%</th>
                    <th className="py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map(({ post, snap }) => {
                    const thumb = mediaThumb(post)
                    const interactions = snap.likes + snap.comments + snap.saved + snap.shares
                    const er = snap.reach > 0 ? ((interactions / snap.reach) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={post.id} className="border-b border-zinc-900 last:border-0 text-xs">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt="" className="h-9 w-9 rounded-sm object-cover border border-zinc-800" />
                            ) : (
                              <div className="h-9 w-9 rounded-sm border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                                <Share2 size={12} className="text-zinc-600" />
                              </div>
                            )}
                            <span className="truncate max-w-56 text-zinc-300">
                              {post.caption.slice(0, 60)}
                              {post.caption.length > 60 ? '…' : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-zinc-300 font-mono">{snap.reach.toLocaleString('es')}</td>
                        <td className="py-2 pr-3 text-zinc-300 font-mono">{snap.likes.toLocaleString('es')}</td>
                        <td className="py-2 pr-3 text-zinc-300 font-mono">{snap.comments.toLocaleString('es')}</td>
                        <td className="py-2 pr-3 text-zinc-300 font-mono">{snap.saved.toLocaleString('es')}</td>
                        <td className="py-2 pr-3 text-zinc-300 font-mono">{er}%</td>
                        <td className="py-2">
                          {post.permalink ? (
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline text-[11px]">
                              Ver
                            </a>
                          ) : (
                            <span className="text-zinc-600">—</span>
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
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Desempeño real de publicaciones">
        {(() => {
          const latest = accountMetricsRes.docs[0] as { followerCount?: number | null; recordedAt?: string | null } | undefined
          return (
            <KpiCard
              label="Seguidores"
              value={(latest?.followerCount ?? 0).toLocaleString('es')}
              icon={TrendingUp}
              accent="indigo"
              note={latest?.recordedAt ? `Último registro: ${dateFmt.format(new Date(latest.recordedAt))}` : 'Sin registro diario todavía'}
            />
          )
        })()}
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
            <SocialWeekCalendar posts={posts} weekStart={monday.toISOString()} />
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
              <a href="/workspace/settings#conexiones" className="text-zinc-300 underline">
                Conectar en Ajustes → Conexiones
              </a>
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
