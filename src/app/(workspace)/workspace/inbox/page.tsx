'use client'

/**
 * InboxPage — `/workspace/inbox`. Conversaciones de WhatsApp/Instagram
 * sincronizadas vía OpenBSP, con hilo y respuesta desde el workspace.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/workspace/ui'

import { PageHero } from '@/components/workspace/oled'

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

export default function InboxPage() {
  const [convs, setConvs] = useState<ConvItem[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [messages, setMessages] = useState<MsgItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const messagesContainerRef = React.useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations?limit=50&sort=-lastMessageAt&depth=1', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { docs: ConvItem[] }
        setConvs(data.docs)
      }
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  const loadThread = useCallback(async (id: number, limit = 50) => {
    const res = await fetch(
      `/api/messages?limit=${limit}&sort=sentAt&where[conversation][equals]=${id}`,
      { credentials: 'include' },
    )
    if (res.ok) {
      const data = (await res.json()) as { docs: MsgItem[]; totalDocs: number }
      setMessages(data.docs)
      setHasMore(data.totalDocs > data.docs.length)
    }
  }, [])

  const loadMoreMessages = async () => {
    if (!selected || loadingOlder) return
    setLoadingOlder(true)
    const newLimit = messages.length + 50
    await loadThread(selected, newLimit)
    setLoadingOlder(false)
  }

  const handleSelect = (id: number) => {
    setSelected(id)
    void loadThread(id)
  }

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

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
    <div className="space-y-4">
      <PageHero
        eyebrow="Mensajería omnicanal"
        title="Unified Inbox"
        description="Conversaciones de WhatsApp e Instagram sincronizadas con OpenBSP."
      />

      <div className="grid gap-3 lg:grid-cols-[20rem_1fr]" style={{ minHeight: 'calc(100vh - 20rem)' }}>
        <div className="oled-card overflow-y-auto">
          <h2 className="border-b border-zinc-800 px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider">Conversaciones</h2>
          {loadingConvs && (
            <div className="p-4 space-y-3" aria-hidden="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {!loadingConvs && convs.length === 0 && <p className="p-4 text-xs text-zinc-500">Sin conversaciones todavía.</p>}
          {!loadingConvs && convs.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={`block w-full border-b border-zinc-900 px-4 py-3 text-left last:border-0 ${selected === c.id ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'}`}
            >
              <strong className="block text-sm text-white">{typeof c.client === 'object' && c.client?.name ? c.client.name : c.contactAddress}</strong>
              <div className="mt-0.5 text-[10px] font-mono text-zinc-500">
                {c.channel} · {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : '—'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col oled-card !p-0">
          {selected == null ? (
            <p className="p-6 text-sm text-zinc-500">Selecciona una conversación.</p>
          ) : (
            <>
              <div ref={messagesContainerRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMoreMessages()}
                    disabled={loadingOlder}
                    className="mx-auto mb-2 px-3 py-1 border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 font-mono disabled:opacity-50"
                  >
                    {loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}
                  </button>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[70%] px-3 py-2 text-sm ${m.direction === 'inbound' ? 'self-start bg-zinc-800 text-white' : 'self-end bg-white text-black'}`}
                  >
                    {m.type !== 'text' && <div className="text-[10px] opacity-70">[{m.type}] </div>}
                    {m.text}
                    <div className="mt-0.5 text-[10px] opacity-60">
                      {m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : ''}
                      {m.direction === 'outbound' && m.statusJson
                        ? ` · ${Object.keys(m.statusJson).join(', ') || 'pending'}`
                        : ''}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-zinc-500">Sin mensajes.</p>}
              </div>
              {error && <div className="border-t border-red-800 bg-red-900/30 px-4 py-2 text-xs text-red-300">{error}</div>}
              <div className="flex gap-2 border-t border-zinc-800 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe tu respuesta…"
                  aria-label="Escribe tu respuesta"
                  className="min-h-[3rem] flex-1 border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                <button
                  onClick={() => void send()}
                  disabled={sending || !draft.trim()}
                  className="self-end px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
