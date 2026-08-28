/**
 * SocialView — Payload custom admin view registrada en `/admin/social`.
 *
 * Puerto de la antigua página `(workspace)/social/page.tsx`. `searchParams`
 * llega como objeto plano desde Payload; se acepta también como Promise por
 * compatibilidad con el patrón de Server Components de Next.js.
 */

import 'server-only'

import Link from 'next/link'
import { Calendar, Plus, Share2, Radio, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { SocialAccount, SocialPost } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface SocialViewProps {
  searchParams?: { tenant?: string | string[] } | Promise<{ tenant?: string | string[] }>
}

export async function SocialView({ searchParams }: SocialViewProps = {}) {
  const params = (await searchParams) ?? {}
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

  // Calcular días de la semana actual
  const now = new Date()
  const currentDayOfWeek = (now.getDay() + 6) % 7 // 0=Lun, 6=Dom
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
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow">
            <span className="workspace-eyebrow-dot" /> Redes sociales y contenidos
          </div>
          <h1 className="workspace-title">Social Hub</h1>
          <p className="workspace-subtitle">
            Calendario editorial, publicaciones y cuentas de {context.tenant.name}.
          </p>
        </div>
        {canEdit ? (
          <div className="workspace-actions">
            <Link className="workspace-button" href="/admin/collections/social-accounts">
              <Radio size={16} /> Cuentas
            </Link>
            <Link
              className="workspace-button workspace-button-primary"
              href="/admin/collections/social-posts/create"
            >
              <Plus size={16} /> Programar post
            </Link>
          </div>
        ) : null}
      </section>

      <section className="workspace-kpis" aria-label="Indicadores sociales">
        <article className="workspace-card workspace-kpi">
          <div className="workspace-kpi-top">
            <span className="workspace-kpi-label">Cuentas vinculadas</span>
            <span className="workspace-kpi-icon"><Radio size={18} /></span>
          </div>
          <div className="workspace-kpi-value">{accounts.length}</div>
          <div className="workspace-kpi-note">{connectedAccountsCount} activas y sincronizadas</div>
        </article>
        <article className="workspace-card workspace-kpi">
          <div className="workspace-kpi-top">
            <span className="workspace-kpi-label">Posts programados</span>
            <span className="workspace-kpi-icon"><Clock size={18} /></span>
          </div>
          <div className="workspace-kpi-value">{scheduledCount}</div>
          <div className="workspace-kpi-note">Listos para autopublicación</div>
        </article>
        <article className="workspace-card workspace-kpi">
          <div className="workspace-kpi-top">
            <span className="workspace-kpi-label">Posts publicados</span>
            <span className="workspace-kpi-icon"><CheckCircle2 size={18} /></span>
          </div>
          <div className="workspace-kpi-value">{publishedCount}</div>
          <div className="workspace-kpi-note">Publicados exitosamente</div>
        </article>
        <article className="workspace-card workspace-kpi">
          <div className="workspace-kpi-top">
            <span className="workspace-kpi-label">Total histórico</span>
            <span className="workspace-kpi-icon"><Share2 size={18} /></span>
          </div>
          <div className="workspace-kpi-value">{posts.length}</div>
          <div className="workspace-kpi-note">En el repositorio del tenant</div>
        </article>
      </section>

      <div className="workspace-grid" style={{ marginTop: '1.5rem' }}>
        {/* Columna Izquierda: Calendario Semanal y Publicaciones */}
        <div className="workspace-stack">
          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Calendario semanal</h2>
                <p className="workspace-card-description">
                  Distribución de publicaciones para la semana en curso.
                </p>
              </div>
              <Calendar size={18} />
            </header>
            <div style={{ padding: '1.25rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '0.5rem',
                  textAlign: 'center',
                }}
              >
                {weekDays.map((day) => (
                  <div
                    key={day.name}
                    style={{
                      background: day.isToday ? 'var(--workspace-raised)' : 'var(--workspace-panel)',
                      border: `1px solid ${day.isToday ? 'var(--workspace-accent)' : 'var(--workspace-border)'}`,
                      borderRadius: 'var(--workspace-radius)',
                      padding: '0.75rem 0.5rem',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--workspace-muted)' }}>{day.name}</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0.25rem 0' }}>
                      {day.dayNum}
                    </div>
                    {day.postsCount > 0 ? (
                      <span
                        className="workspace-badge"
                        style={{
                          background: 'color-mix(in srgb, var(--workspace-accent) 20%, transparent)',
                          color: 'var(--workspace-accent)',
                          border: 'none',
                          fontSize: '0.625rem',
                        }}
                      >
                        {day.postsCount} post{day.postsCount > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.625rem', color: 'var(--workspace-muted)', opacity: 0.5 }}>
                        —
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Publicaciones recientes y programadas</h2>
                <p className="workspace-card-description">Listado editorial por estado y fecha.</p>
              </div>
              <Link className="workspace-button" href="/admin/collections/social-posts">
                Ver todas
              </Link>
            </header>
            <div className="workspace-card-body">
              {posts.length === 0 ? (
                <div className="workspace-empty">
                  No hay publicaciones registradas para este tenant todavía.
                </div>
              ) : (
                <div className="workspace-list">
                  {posts.slice(0, 8).map((p) => {
                    const accountObj = typeof p.account === 'object' && p.account ? (p.account as SocialAccount) : null
                    const accountLabel = accountObj?.accountName || 'Cuenta Social'
                    const dateStr = p.scheduledAt || p.publishedAt || p.createdAt

                    return (
                      <div className="workspace-list-row" key={p.id}>
                        <div className="workspace-list-copy">
                          <strong>{p.caption.slice(0, 80)}{p.caption.length > 80 ? '…' : ''}</strong>
                          <span>
                            {accountLabel} · {dateStr ? dateFmt.format(new Date(dateStr)) : 'Sin fecha'}
                          </span>
                        </div>
                        <span
                          className="workspace-badge"
                          data-tone={
                            p.status === 'fallido'
                              ? 'danger'
                              : p.status === 'publicado'
                                ? undefined
                                : undefined
                          }
                          style={
                            p.status === 'publicado'
                              ? { color: 'var(--workspace-accent)', borderColor: 'var(--workspace-accent)' }
                              : undefined
                          }
                        >
                          {p.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </article>
        </div>

        {/* Columna Derecha: Cuentas Conectadas */}
        <div className="workspace-stack">
          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Cuentas vinculadas</h2>
                <p className="workspace-card-description">Integración con Meta Graph API.</p>
              </div>
              {canEdit ? (
                <Link className="workspace-button" href="/admin/collections/social-accounts/create">
                  <Plus size={14} />
                </Link>
              ) : null}
            </header>
            <div className="workspace-card-body">
              {accounts.length === 0 ? (
                <div className="workspace-empty">
                  <AlertCircle size={24} style={{ marginBottom: '0.5rem', opacity: 0.7 }} />
                  <div>Sin cuentas sociales conectadas.</div>
                  {canEdit ? (
                    <Link
                      href="/admin/collections/social-accounts/create"
                      className="workspace-button workspace-button-primary"
                      style={{ marginTop: '0.75rem' }}
                    >
                      Conectar cuenta
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--workspace-raised)',
                        border: '1px solid var(--workspace-border)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 650, fontSize: '0.8125rem' }}>{acc.accountName}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted)', marginTop: '0.2rem' }}>
                          {acc.platform === 'instagram' ? 'Instagram Business' : 'Facebook Page'}
                        </div>
                      </div>
                      <span
                        className="workspace-badge"
                        style={
                          acc.status === 'conectada'
                            ? { color: 'var(--workspace-accent)', borderColor: 'var(--workspace-accent)' }
                            : { color: 'var(--workspace-danger)', borderColor: 'var(--workspace-danger)' }
                        }
                      >
                        ● {acc.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
