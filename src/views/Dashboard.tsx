'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// ── Paleta Hermes (integrada con tokens de Payload) ─────────────────────────
const C = {
  bg: 'var(--color-bg-primary, #050505)',
  card: 'var(--color-bg-secondary, #090909)',
  border: 'var(--color-border, #1a1a1a)',
  borderHover: 'var(--color-border-hover, #333333)',
  label: 'var(--color-text-secondary, #888888)',
  faint: 'var(--color-text-muted, #555555)',
  mid: 'var(--color-text-secondary, #777777)',
  title: 'var(--color-text-primary, #aaaaaa)',
  white: 'var(--color-text-primary, #ffffff)',
  skeleton: 'var(--color-bg-tertiary, #111111)',
} as const

const RAINBOW = 'linear-gradient(to top, #ff3333, #ffaa00, #00ffaa, #00aaff, #aa00ff)'
const RAINBOW_SVG = ['#ff3333', '#ffaa00', '#00ffaa', '#00aaff', '#aa00ff']

const micro: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}
const bigNumber: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 500,
  color: C.white,
  letterSpacing: '-0.02em',
  lineHeight: 1,
}
const sectionMarker = (_n: number): React.CSSProperties => ({
  position: 'absolute',
  left: -10,
  top: -10,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  background: C.white,
  color: '#000',
  fontSize: 10,
  fontWeight: 700,
})

// ── Tipos ────────────────────────────────────────────────────────────────────
interface FollowUpItem {
  kind: 'lead' | 'client'
  id: number
  name: string
  phone: string
  pipeline: string
  daysSince: number
  reason: string
  waLink: string
  crmUrl: string
}
interface ConvItem {
  id: number
  contactAddress: string
  lastInboundAt: string | null
  lastMessageAt: string | null
}
interface NotifItem {
  id: number
  title: string
  severity: 'info' | 'warning' | 'error'
  createdAt?: string
}

type Stats = {
  leadsTotal: number
  leadBars: number[]
  cobrosAbiertos: number
  cobrosAbiertosUsd: number
  pctCobradoMes: number
  sinResponder: number
  respBars: number[]
}

function timeAgoEs(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (!Number.isFinite(m)) return '—'
  if (m < 60) return `HACE ${m} MIN`
  const h = Math.floor(m / 60)
  if (h < 24) return `HACE ${h} HRS`
  return `HACE ${Math.floor(h / 24)} DÍAS`
}

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export const DashboardView: React.FC = () => {
  const [me, setMe] = useState('AGENTE')
  const [stats, setStats] = useState<Stats | null>(null)
  const [followups, setFollowups] = useState<FollowUpItem[]>([])
  const [unanswered, setUnanswered] = useState<ConvItem[]>([])
  const [notifs, setNotifs] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [
        meRes,
        statsRes,
        convsRes,
        notifsRes,
        followupsRes,
      ] = await Promise.all([
        getJson<{ user?: { firstName?: string; name?: string; email?: string } }>('/api/users/me'),
        getJson<Stats>('/api/dashboard/stats'),
        getJson<{ docs: ConvItem[] }>(
          '/api/conversations?limit=4&sort=-lastInboundAt&select=contactAddress,lastInboundAt,lastMessageAt',
        ),
        getJson<{ docs: NotifItem[] }>(
          '/api/notifications?limit=5&depth=0&sort=-createdAt&where[read][equals]=false',
        ),
        getJson<{ items: FollowUpItem[] }>('/api/followups/hoy'),
      ])

      const name =
        meRes?.user?.firstName ??
        meRes?.user?.name?.split(' ')[0] ??
        meRes?.user?.email?.split('@')[0] ??
        'AGENTE'
      setMe(name.toUpperCase())

      setStats(
        statsRes ?? {
          leadsTotal: 0,
          leadBars: [0, 0, 0, 0],
          cobrosAbiertos: 0,
          cobrosAbiertosUsd: 0,
          pctCobradoMes: 0,
          sinResponder: 0,
          respBars: [0, 0, 0],
        },
      )
      setUnanswered(convsRes?.docs ?? [])
      setNotifs(notifsRes?.docs ?? [])
      setFollowups((followupsRes?.items ?? []).slice(0, 4))
      setLoading(false)
    } catch {
      setError('No se pudo cargar el dashboard — recargá la página')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial al montar; los setState ocurren después del await (no son síncronos)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const greeting =
    new Date().getHours() < 12
      ? 'BUENOS DÍAS'
      : new Date().getHours() < 18
        ? 'BUENAS TARDES'
        : 'BUENAS NOCHES'

  const fecha = new Date()
    .toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long' })
    .toUpperCase()

  const donutFill = (stats?.pctCobradoMes ?? 0) * 1.0053
  const maxLead = Math.max(...(stats?.leadBars ?? [1]), 1)
  const maxResp = Math.max(...(stats?.respBars ?? [1]), 1)

  const barStyle = (val: number, max: number): React.CSSProperties => {
    const h = Math.max(Math.round((val / Math.max(max, 1)) * 100), 6)
    return {
      height: `${h}%`,
      flex: 1,
      background: val === max && val > 0 ? RAINBOW : val > 0 ? '#333' : '#222',
    }
  }

  const card: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 144,
    border: `1px solid ${C.border}`,
    background: C.card,
    padding: 20,
  }

  const panel: React.CSSProperties = {
    position: 'relative',
    border: `1px solid ${C.border}`,
    background: C.card,
    padding: '28px 24px 24px',
  }

  const verTodas: React.CSSProperties = {
    borderBottom: `1px solid ${C.borderHover}`,
    paddingBottom: 2,
    fontSize: 9,
    letterSpacing: '0.12em',
    color: C.faint,
    textDecoration: 'none',
  }

  return (
    <div style={{ padding: '32px 40px 64px', background: C.bg, minHeight: '100vh' }}>
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 40,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: C.label }}>
            {greeting},&nbsp;<span style={{ color: C.white }}>{loading ? '…' : me}</span>.
          </h1>
          <div style={{ ...micro, fontSize: 10, color: C.label }}>CONECTADO // {fecha}</div>
        </div>
        <Link
          href="/admin/collections/leads/create"
          style={{
            background: C.white,
            color: '#000',
            padding: '12px 24px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textDecoration: 'none',
          }}
        >
          NUEVO LEAD
        </Link>
      </div>

      {error && (
        <div style={{ color: '#f87171', marginBottom: 24, ...micro }}>{error}</div>
      )}

      {/* SECCIÓN 1 — STAT CARDS */}
      <div style={{ position: 'relative', marginBottom: 40 }}>
        <div style={sectionMarker(1)}>1</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
          }}
        >
          <div style={card}>
            <div style={{ ...micro, color: C.label }}>LEADS // PIPELINE</div>
            <div style={{ marginTop: 16, height: 40, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {(stats?.leadBars ?? []).map((v, i) => (
                <div key={i} style={barStyle(v, maxLead)} />
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={bigNumber}>{loading ? '—' : stats?.leadsTotal ?? 0}</span>
              <span style={{ ...micro, color: C.label }}>LEADS</span>
            </div>
          </div>

          <div style={card}>
            <div style={{ ...micro, color: C.label }}>COBROS // PIPELINE</div>
            <div style={{ marginTop: 16, height: 40 }}>
              <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rg-line" x1="0%" y1="0%" x2="100%" y2="0%">
                    {RAINBOW_SVG.map((c, i) => (
                      <stop key={c} offset={`${i * 25}%`} stopColor={c} />
                    ))}
                  </linearGradient>
                </defs>
                <path
                  d="M0,35 Q30,35 50,20 T100,10 T140,30 T180,5 T200,20"
                  fill="none"
                  stroke="url(#rg-line)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={bigNumber}>{loading ? '—' : stats?.cobrosAbiertos ?? 0}</span>
              <span style={{ ...micro, color: C.label }}>POR COBRAR</span>
            </div>
          </div>

          <div style={{ ...card, position: 'relative' }}>
            <div style={{ ...micro, color: C.label }}>COBROS // MES</div>
            {!loading && (
              <svg
                width="56"
                height="56"
                viewBox="0 0 40 40"
                style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-55%)' }}
              >
                <defs>
                  <linearGradient id="rg-donut" x1="0%" y1="0%" x2="100%" y2="0%">
                    {RAINBOW_SVG.map((c, i) => (
                      <stop key={c} offset={`${i * 25}%`} stopColor={c} />
                    ))}
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="16" fill="none" stroke="#222" strokeWidth="3" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="url(#rg-donut)"
                  strokeWidth="3"
                  strokeDasharray={`${donutFill} 100.53`}
                  strokeLinecap="round"
                  transform="rotate(-90 20 20)"
                />
                <text x="20" y="23" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">
                  {stats?.pctCobradoMes ?? 0}%
                </text>
              </svg>
            )}
            <div style={{ marginTop: 52, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={bigNumber}>
                {loading ? '—' : fmtUsd(stats ? stats.cobrosAbiertosUsd : 0)}
              </span>
              <span style={{ ...micro, color: C.label }}>POR COBRAR</span>
            </div>
          </div>

          <div style={card}>
            <div style={{ ...micro, color: C.label }}>CONVERSACIONES // SIN_RESPONDER</div>
            <div style={{ marginTop: 16, height: 40, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {(stats?.respBars ?? []).map((v, i) => (
                <div key={i} style={barStyle(v, maxResp)} />
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={bigNumber}>{loading ? '—' : stats?.sinResponder ?? 0}</span>
              <span style={{ ...micro, color: C.label }}>&gt; 4H SIN RESPUESTA</span>
            </div>
          </div>
        </div>
      </div>

      {/* GRID PRINCIPAL 8 + 4 */}
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* COLUMNA IZQUIERDA */}
        <div style={{ flex: '1 1 560px', display: 'flex', flexDirection: 'column', gap: 40 }}>
          {/* SECCIÓN 2 — HOY */}
          <div style={panel}>
            <div style={sectionMarker(2)}>2</div>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}
            >
              <div style={{ ...micro, color: C.title }}>HOY // SEGUIMIENTOS</div>
              <Link href="/admin/hoy" style={verTodas}>
                VER_TODOS →
              </Link>
            </div>
            {loading ? (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      height: 52,
                      border: `1px solid ${C.border}`,
                      background: C.skeleton,
                      marginBottom: 12,
                    }}
                  />
                ))}
              </>
            ) : followups.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.faint, padding: '32px 0' }}>
                  NADA_PENDIENTE_HOY
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {followups.map((f) => (
                    <div
                      key={`${f.kind}-${f.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        border: `1px solid ${C.border}`,
                        padding: 16,
                      }}
                    >
                      <div style={{ minWidth: 48, ...micro, color: C.mid }}>{f.daysSince}D</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: C.white,
                            textTransform: 'capitalize',
                            marginBottom: 2,
                          }}
                        >
                          {f.name}
                        </div>
                        <div style={{ ...micro, fontSize: 9, color: C.label }}>
                          {`${f.kind === 'lead' ? 'LEAD' : 'CLIENTE'} // ${f.reason.toUpperCase()}`}
                        </div>
                      </div>
                      <a
                        href={f.waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          border: `1px solid ${C.borderHover}`,
                          padding: '4px 10px',
                          fontSize: 9,
                          letterSpacing: '0.12em',
                          color: '#4ade80',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        WHATSAPP →
                      </a>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* SECCIÓN 3 — SIN RESPONDER */}
          <div style={{ ...panel, minHeight: 220 }}>
            <div style={sectionMarker(3)}>3</div>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}
            >
                <div style={{ ...micro, color: C.title }}>{'CONVERSACIONES // ESPERANDO'}</div>
              <Link href="/admin/inbox" style={verTodas}>
                VER_INBOX →
              </Link>
            </div>
            {loading || unanswered.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.faint, padding: '32px 0' }}>
                {loading ? 'CARGANDO…' : 'TODO_RESPONDIDO'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {unanswered.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                    <div
                      style={{
                        width: 3,
                        flexShrink: 0,
                        background:
                          i === 0
                            ? 'linear-gradient(to bottom, #3b82f6, #8b5cf6)'
                            : C.borderHover,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.white }}>
                        {c.contactAddress}
                      </div>
                      <div style={{ ...micro, fontSize: 9, color: C.label, marginTop: 2 }}>
                        {c.lastInboundAt ? timeAgoEs(c.lastInboundAt) : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA */}
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ ...panel, position: 'sticky', top: 24 }}>
            <div style={sectionMarker(4)}>4</div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ ...micro, color: C.title }}>ALERTAS // NOTIFICACIONES</div>
            </div>
            {loading ? (
              <div style={{ height: 60, background: C.skeleton }} />
            ) : notifs.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.faint, padding: '24px 0' }}>
                SIN_ALERTAS
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {notifs.map((n) => (
                  <div key={n.id} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          background:
                            n.severity === 'error'
                              ? '#ff3333'
                              : n.severity === 'warning'
                                ? '#ffaa00'
                                : '#00ffaa',
                        }}
                      />
                      <span style={{ ...micro, fontSize: 9, color: C.mid }}>
                        {n.createdAt ? timeAgoEs(n.createdAt) : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.white, lineHeight: 1.4 }}>{n.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
