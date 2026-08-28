/**
 * SocialPage — `/workspace/social`. Calendario editorial, publicaciones
 * y cuentas conectadas del tenant activo.
 */

import Link from 'next/link'
import { Calendar, Plus, Share2, Radio, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { SocialAccount, SocialPost } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId, canEdit } = context

  const [accountsRes, postsRes] = await Promise.all([
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
    <>
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Redes sociales y contenidos</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Social Hub</h1>
            <p className="mt-1 text-xs text-zinc-400">Calendario editorial, publicaciones y cuentas de {context.tenant.name}.</p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/collections/social-accounts" className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Radio size={16} /> Cuentas
              </Link>
              <Link href="/admin/collections/social-posts/create" className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Plus size={16} /> Programar post
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Indicadores sociales">
        <article className="border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Cuentas vinculadas</span><Radio size={16} className="text-zinc-500" /></div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{accounts.length}</div>
          <div className="mt-1 text-xs text-zinc-500">{connectedAccountsCount} activas y sincronizadas</div>
        </article>
        <article className="border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Posts programados</span><Clock size={16} className="text-zinc-500" /></div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{scheduledCount}</div>
          <div className="mt-1 text-xs text-zinc-500">Listos para autopublicación</div>
        </article>
        <article className="border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Posts publicados</span><CheckCircle2 size={16} className="text-zinc-500" /></div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{publishedCount}</div>
          <div className="mt-1 text-xs text-zinc-500">Publicados exitosamente</div>
        </article>
        <article className="border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Total histórico</span><Share2 size={16} className="text-zinc-500" /></div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{posts.length}</div>
          <div className="mt-1 text-xs text-zinc-500">En el repositorio del tenant</div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_.8fr]">
        <div className="flex flex-col gap-4">
          <div className="border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Calendario semanal</p>
                <h2 className="text-base font-bold text-white">Distribución de publicaciones</h2>
              </div>
              <Calendar size={18} className="text-zinc-500" />
            </div>
            <div className="grid grid-cols-7 gap-2 text-center">
              {weekDays.map((day) => (
                <div key={day.name} className={`border p-3 ${day.isToday ? 'border-white bg-zinc-900' : 'border-zinc-800 bg-black'}`}>
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
          </div>

          <div className="border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Editorial</p>
                <h2 className="text-base font-bold text-white">Publicaciones recientes y programadas</h2>
              </div>
              <Link href="/admin/collections/social-posts" className="text-xs text-zinc-400 hover:text-white font-mono">Ver todas</Link>
            </div>
            {posts.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500 font-mono">No hay publicaciones registradas para este tenant todavía.</div>
            ) : (
              <div className="flex flex-col">
                {posts.slice(0, 8).map((p) => {
                  const accountObj = typeof p.account === 'object' && p.account ? (p.account as SocialAccount) : null
                  const accountLabel = accountObj?.accountName || 'Cuenta Social'
                  const dateStr = p.scheduledAt || p.publishedAt || p.createdAt
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 py-2.5 last:border-0">
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-white">{p.caption.slice(0, 80)}{p.caption.length > 80 ? '…' : ''}</strong>
                        <span className="text-[10px] text-zinc-500 font-mono">{accountLabel} · {dateStr ? dateFmt.format(new Date(dateStr)) : 'Sin fecha'}</span>
                      </div>
                      <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 ${p.status === 'fallido' ? 'bg-red-900/50 text-red-400 border border-red-800' : p.status === 'publicado' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
                        {p.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Integración</p>
              <h2 className="text-base font-bold text-white">Cuentas vinculadas</h2>
            </div>
            {canEdit ? (
              <Link href="/admin/collections/social-accounts/create" className="px-2 py-1 bg-zinc-900 border border-zinc-700 text-white"><Plus size={14} /></Link>
            ) : null}
          </div>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-zinc-500">
              <AlertCircle size={22} />
              <div>Sin cuentas sociales conectadas.</div>
              {canEdit ? (
                <Link href="/admin/collections/social-accounts/create" className="mt-2 px-3 py-1.5 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Conectar cuenta</Link>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-3 border border-zinc-800 bg-black p-3">
                  <div>
                    <div className="text-xs font-semibold text-white">{acc.accountName}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{acc.platform === 'instagram' ? 'Instagram Business' : 'Facebook Page'}</div>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${acc.status === 'conectada' ? 'border-emerald-800 text-emerald-400' : 'border-red-800 text-red-400'}`}>
                    ● {acc.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
