'use client'

import React, { useCallback, useEffect, useState } from 'react'

interface FollowUpItem {
  kind: 'lead' | 'client'
  id: number
  name: string
  phone: string
  pipeline: string
  daysSince: number
  reason: string
  priority: number
  waLink: string
  crmUrl: string
}

const row = (): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '12px 16px',
  borderBottom: '1px solid var(--theme-elevation-150)',
})

const badge = (color: string): React.CSSProperties => ({
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: color,
  color: '#fff',
  whiteSpace: 'nowrap',
})

export const HoyView: React.FC = () => {
  const [items, setItems] = useState<FollowUpItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch('/api/followups/hoy', { credentials: 'include' })
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Sesión expirada — recargá la página' : `Error ${res.status}`)
      }
      const data = (await res.json()) as { items: FollowUpItem[] }
      setItems(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial al montar; los setState ocurren después del await (no son síncronos)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Hoy</h1>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--theme-elevation-200)',
            cursor: loading ? 'wait' : 'pointer',
            background: 'var(--theme-elevation-50)',
          }}
        >
          {loading ? 'Cargando…' : 'Refrescar'}
        </button>
      </div>
      <p style={{ marginTop: 0, color: 'var(--theme-elevation-500)' }}>
        A quién escribirle hoy. El primer mensaje lo abrís vos; cuando respondan, el agente sigue solo.
      </p>

      {error && <div style={{ color: 'var(--theme-error-500)', marginBottom: 12 }}>{error}</div>}
      {!loading && items.length === 0 && !error && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--theme-elevation-400)' }}>
          Nada pendiente por hoy 🎉
        </div>
      )}

      <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, overflow: 'hidden' }}>
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} style={row()}>
            <span style={badge(item.kind === 'lead' ? 'var(--theme-warning-500)' : 'var(--theme-success-500)')}>
              {item.kind === 'lead' ? 'Lead' : 'Cliente'}
            </span>
            <strong style={{ minWidth: 160 }}>{item.name}</strong>
            <span style={{ color: 'var(--theme-elevation-500)', fontSize: 13 }}>{item.pipeline}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{item.reason}</span>
            <a href={item.crmUrl} style={{ fontSize: 13 }}>
              Ver ficha
            </a>
            <a
              href={item.waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                background: '#25d366',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: 'nowrap',
              }}
            >
              WhatsApp
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
