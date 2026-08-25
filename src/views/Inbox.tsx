'use client'

import React, { useCallback, useEffect, useState } from 'react'

interface ConvItem {
  id: number
  contactAddress: string
  channel: string
  lastMessageAt: string | null
  lastInboundAt: string | null
  client?: { name?: string } | number | null
}

interface MsgItem {
  id: number
  direction: 'inbound' | 'outbound'
  text: string | null
  type: string
  sentAt: string | null
  statusJson?: Record<string, unknown> | null
}

const bubble = (dir: string): React.CSSProperties => ({
  maxWidth: '70%',
  padding: '8px 12px',
  borderRadius: 12,
  margin: '4px 0',
  background: dir === 'inbound' ? 'var(--theme-elevation-100)' : 'var(--theme-success-500)',
  color: dir === 'inbound' ? 'inherit' : '#fff',
  alignSelf: dir === 'inbound' ? 'flex-start' : 'flex-end',
  wordBreak: 'break-word',
})

export const InboxView: React.FC = () => {
  const [convs, setConvs] = useState<ConvItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [messages, setMessages] = useState<MsgItem[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/conversations?limit=50&sort=-lastMessageAt&depth=1', {
      credentials: 'include',
    })
    if (res.ok) {
      const data = (await res.json()) as { docs: ConvItem[] }
      setConvs(data.docs)
    }
  }, [])

  const loadThread = useCallback(async (id: number) => {
    const res = await fetch(
      `/api/messages?limit=200&sort=sentAt&where[conversation][equals]=${id}`,
      { credentials: 'include' },
    )
    if (res.ok) {
      const data = (await res.json()) as { docs: MsgItem[] }
      setMessages(data.docs)
    }
  }, [])

  useEffect(() => {
    // Carga inicial al montar; los setState ocurren después del await (no son síncronos)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    // Carga del hilo al seleccionar conversación
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThread(selected)
  }, [selected, loadThread])

  const send = async (): Promise<void> => {
    if (!selected || !draft.trim()) return
    setSending(true)
    setError(null)
    const res = await fetch('/api/messaging/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ conversationId: selected, text: draft }),
    })
    const data = (await res.json()) as { error?: string; needsTemplate?: boolean }
    setSending(false)
    if (!res.ok) {
      setError(data.error ?? 'Error enviando')
      return
    }
    setDraft('')
    await loadThread(selected)
    await loadConversations()
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - var(--base-nav-body-offset, 120px))', minHeight: 480 }}>
      <div style={{ width: 320, overflowY: 'auto', borderRight: '1px solid var(--theme-elevation-150)', paddingRight: 8 }}>
        <h2 style={{ padding: '8px 4px' }}>Conversaciones</h2>
        {convs.length === 0 && <p style={{ padding: 8 }}>Sin conversaciones todavía.</p>}
        {convs.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 10,
              marginBottom: 4,
              borderRadius: 8,
              cursor: 'pointer',
              border: selected === c.id ? '2px solid var(--theme-success-500)' : '1px solid var(--theme-elevation-150)',
              background: selected === c.id ? 'var(--theme-elevation-50)' : 'transparent',
            }}
          >
            <strong>{typeof c.client === 'object' && c.client?.name ? c.client.name : c.contactAddress}</strong>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {c.channel} · {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : '—'}
            </div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selected == null ? (
          <p style={{ opacity: 0.6, marginTop: 24 }}>Selecciona una conversación.</p>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 12 }}>
              {messages.map((m) => (
                <div key={m.id} style={bubble(m.direction)}>
                  {m.type !== 'text' && <div style={{ fontSize: 11, opacity: 0.8 }}>[{m.type}] </div>}
                  {m.text}
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : ''}
                    {m.direction === 'outbound' && m.statusJson
                      ? ` · ${Object.keys(m.statusJson).join(', ') || 'pending'}`
                      : ''}
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p style={{ opacity: 0.6 }}>Sin mensajes.</p>}
            </div>
            {error && (
              <div style={{ color: 'var(--theme-error-500)', padding: '4px 12px', fontSize: 13 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--theme-elevation-150)' }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe tu respuesta…"
                style={{ flex: 1, minHeight: 48, borderRadius: 8 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <button
                className="btn btn--style-primary"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                style={{ alignSelf: 'flex-end' }}
              >
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
