'use client'

/**
 * InboxWorkspace — inbox estilo Chatwoot de 3 paneles:
 *  1. Lista de conversaciones con estado (open/pending/resolved),
 *     prioridad, etiquetas, agente asignado y filtro por estado.
 *  2. Hilo de mensajes con respuestas enlatadas (message-templates).
 *  3. Panel de contexto: contacto vinculado (lead/cliente), notas
 *     internas privadas, asignación, snooze y etiquetas.
 *
 * Todas las mutaciones usan la REST API de Payload con cookies
 * (credentials: include); el acceso lo regula el access control de las
 * colecciones (lectura: authenticated; escritura: editorsOnly) — los
 * viewers reciben las superficies de edición deshabilitadas.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  open: { label: 'Abierta', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  pending: { label: 'Pendiente', dot: 'bg-amber-400', text: 'text-amber-300' },
  resolved: { label: 'Resuelta', dot: 'bg-zinc-500', text: 'text-zinc-400' },
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'bg-red-900/50 text-red-300 border border-red-800' },
  media: { label: 'Media', cls: 'bg-zinc-800 text-zinc-300 border border-zinc-700' },
  baja: { label: 'Baja', cls: 'bg-zinc-900 text-zinc-400 border border-zinc-800' },
}

const LABELS = ['seguimiento', 'facturacion', 'soporte', 'renovacion', 'urgente', 'oportunidad'] as const

interface ConvItem {
  id: number
  contactAddress: string
  channel: string
  status?: string | null
  priority?: string | null
  labels?: string[] | null
  snoozeUntil?: string | null
  lastMessageAt: string | null
  lastInboundAt: string | null
  assignee?: { id: number; firstName?: string; lastName?: string; email?: string } | number | null
  client?: { id: number; name?: string } | number | null
  lead?: { id: number; fullName?: string; companyName?: string | null } | number | null
}

interface MsgItem {
  id: number
  direction: 'inbound' | 'outbound'
  text: string | null
  type: string
  sentAt: string | null
  statusJson?: Record<string, unknown> | null
}

interface NoteItem {
  id: number
  body: string
  author?: { firstName?: string; lastName?: string; email?: string } | number | null
  createdAt: string
}

interface TemplateItem {
  id: number
  name: string
  bodyText?: string | null
}

interface PersonLite {
  id: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

const personName = (p: { id?: number; firstName?: string | null; lastName?: string | null; email?: string | null } | number | null | undefined): string => {
  if (!p || typeof p === 'number') return 'Sin asignar'
  const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
  return name || p.email || `#${p.id ?? '?'}`
}

const timeShort = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—'

export function InboxWorkspace({
  canEdit,
  tenantId,
  initialConversationId,
}: {
  canEdit: boolean
  tenantId: number
  /** Deep link desde la ficha CRM (/workspace/inbox?c=<id>). */
  initialConversationId?: number | null
}) {
  const [convs, setConvs] = useState<ConvItem[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<'open' | 'pending' | 'resolved' | 'all'>('open')
  const [selected, setSelected] = useState<number | null>(null)
  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null)
  const [messages, setMessages] = useState<MsgItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [team, setTeam] = useState<PersonLite[]>([])
  /** Reloj capturado en callbacks async (nunca durante el render, regla de pureza). */
  const [nowTs, setNowTs] = useState(0)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  /** Ref del hilo seleccionado: descarta respuestas fetch de hilos viejos (carrera). */
  const latestConvRef = useRef<number | null>(null)

  const buildConvParams = useCallback((filter: typeof statusFilter): string => {
    const params = new URLSearchParams({ limit: '50', sort: '-lastMessageAt', depth: '1' })
    if (filter === 'pending' || filter === 'resolved') {
      params.set('where[status][equals]', filter)
    } else if (filter === 'open') {
      // Filtro en la query: abiertas y sin snooze vigente (Devin Review).
      params.set('where[and][0][status][equals]', 'open')
      params.set('where[and][1][or][0][snoozeUntil][exists]', 'false')
      params.set('where[and][1][or][1][snoozeUntil][less_than]', new Date().toISOString())
    }
    return params.toString()
  }, [])

  const loadConversations = useCallback(async () => {
    const res = await fetch(`/api/conversations?${buildConvParams(statusFilter)}`, { credentials: 'include' })
    if (res.ok) {
      const data = (await res.json()) as { docs: ConvItem[] }
      setConvs(data.docs)
      setNowTs(Date.now())
    }
  }, [buildConvParams, statusFilter])

  const loadThread = useCallback(async (id: number, limit = 50) => {
    const res = await fetch(`/api/messages?limit=${limit}&sort=-sentAt&where[conversation][equals]=${id}`, {
      credentials: 'include',
    })
    // Carrera: si el agente ya cambió de conversación, descarta la respuesta vieja.
    if (latestConvRef.current !== id) return
    if (res.ok) {
      const data = (await res.json()) as { docs: MsgItem[]; totalDocs: number }
      setMessages([...data.docs].reverse())
      setHasMore(data.totalDocs > data.docs.length)
    }
  }, [])

  const loadNotes = useCallback(async (id: number) => {
    const res = await fetch(
      `/api/conversation-notes?limit=20&sort=-createdAt&depth=1&where[conversation][equals]=${id}`,
      { credentials: 'include' },
    )
    if (latestConvRef.current !== id) return
    if (res.ok) {
      const data = (await res.json()) as { docs: NoteItem[] }
      setNotes(data.docs)
    }
  }, [])

  // Carga inicial + refetch al cambiar el filtro de estado: setState dentro
  // de callbacks .then (no en el cuerpo síncrono del effect, regla react-hooks v6).
  useEffect(() => {
    let cancelled = false
    fetch(`/api/conversations?${buildConvParams(statusFilter)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { docs: ConvItem[] } | null) => {
        if (!cancelled && data) {
          setConvs(data.docs)
          setNowTs(Date.now())
        }
      })
      .catch(() => {})
    fetch('/api/message-templates?limit=20&sort=name', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { docs: TemplateItem[] } | null) => {
        if (!cancelled && data) setTemplates(data.docs)
      })
      .catch(() => {})
    fetch('/api/users?limit=50&sort=firstName&where[active][equals]=true', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { docs: PersonLite[] } | null) => {
        if (!cancelled && data) setTeam(data.docs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [statusFilter, buildConvParams])

  const handleSelect = useCallback(
    (conv: ConvItem) => {
      latestConvRef.current = conv.id
      setSelected(conv.id)
      setSelectedConv(conv)
      setNotes([])
      void loadThread(conv.id)
      void loadNotes(conv.id)
    },
    [loadThread, loadNotes],
  )

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  // Deep link desde la ficha CRM (?c=<id>): selecciona la conversación una
  // vez cargada la lista; si el filtro actual no la incluye, la trae directa.
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (!initialConversationId || deepLinkApplied.current || !convs) return
    deepLinkApplied.current = true
    const found = convs.find((d) => d.id === initialConversationId)
    if (found) {
      // Fuera del cuerpo síncrono del effect (regla react-hooks v6, mismo
      // criterio que los .then del resto del componente).
      queueMicrotask(() => handleSelect(found))
      return
    }
    fetch(`/api/conversations/${initialConversationId}?depth=1`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: ConvItem | null) => {
        if (doc?.id) handleSelect(doc)
      })
      .catch(() => {})
  }, [initialConversationId, convs, handleSelect])

  const loadMoreMessages = async () => {
    if (!selected || loadingOlder) return
    setLoadingOlder(true)
    await loadThread(selected, messages.length + 50)
    setLoadingOlder(false)
  }

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

  const patchConversation = async (id: number, patch: Record<string, unknown>) => {
    setSavingMeta(true)
    setError(null)
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    })
    setSavingMeta(false)
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: unknown }
      setError(data.error ?? 'No se pudo actualizar la conversación')
      return
    }
    await loadConversations()
    const fresh = await fetch(`/api/conversations/${id}?depth=1`, { credentials: 'include' })
    if (fresh.ok) setSelectedConv(((await fresh.json()) as ConvItem))
  }

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return
    setSavingMeta(true)
    const res = await fetch('/api/conversation-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ conversation: selected, body: noteDraft.trim(), tenant: tenantId }),
    })
    setSavingMeta(false)
    if (!res.ok) {
      setError('No se pudo guardar la nota')
      return
    }
    setNoteDraft('')
    await loadNotes(selected)
  }

  const visibleConvs = (convs ?? []).filter((c) => {
    if (statusFilter === 'all') return true
    const st = c.status ?? 'open'
    // Un snooze expirado no oculta la conversación: vuelve a Abiertas.
    if (statusFilter === 'open') {
      return st === 'open' && (!c.snoozeUntil || new Date(c.snoozeUntil).getTime() <= nowTs)
    }
    return st === statusFilter
  })

  const convName = (c: ConvItem): string =>
    typeof c.client === 'object' && c.client?.name
      ? c.client.name
      : typeof c.lead === 'object' && c.lead?.fullName
        ? c.lead.fullName
        : c.contactAddress

  const snoozed = selectedConv?.snoozeUntil ? new Date(selectedConv.snoozeUntil) : null
  const snoozeActive = snoozed ? snoozed.getTime() > nowTs : false

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Inbox Omnicanal</p>
          <h1 className="text-lg font-bold text-white">Conversaciones</h1>
        </div>
        <div className="flex border border-zinc-800 bg-zinc-950 p-0.5" role="tablist" aria-label="Filtrar por estado">
          {(['open', 'pending', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-[11px] font-mono uppercase transition ${statusFilter === s ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
            >
              {s === 'all' ? 'Todas' : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="border border-red-800 bg-red-900/30 px-4 py-2 text-xs text-red-300">{error}</div>}

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
        {/* Panel 1: lista de conversaciones */}
        <div className="flex max-h-[70vh] flex-col overflow-y-auto oled-card !p-0 xl:col-span-3">
          {convs === null || visibleConvs.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">
              {convs === null
                ? 'Cargando…'
                : `Sin conversaciones ${statusFilter === 'all' ? '' : STATUS_META[statusFilter].label.toLowerCase() + 's'}.`}
            </p>
          ) : (            visibleConvs.map((c) => {
              const st = STATUS_META[c.status ?? 'open'] ?? STATUS_META.open
              const pr = PRIORITY_META[c.priority ?? 'media'] ?? PRIORITY_META.media
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full border-b border-zinc-900 px-4 py-3 text-left transition last:border-0 ${selected === c.id ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} aria-label={st.label} />
                    <strong className="flex-1 truncate text-sm text-white">{convName(c)}</strong>
                    <span className={`px-1.5 py-0.5 text-[9px] font-mono uppercase ${pr.cls}`}>{pr.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                    <span>{c.channel}</span>
                    <span>·</span>
                    <span>{timeShort(c.lastMessageAt)}</span>
                    {c.snoozeUntil && nowTs > 0 && new Date(c.snoozeUntil).getTime() > nowTs && <span title="Snooze activo">😴</span>}
                  </div>
                  {(c.labels?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.labels?.map((l) => (
                        <span key={l} className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300">{l}</span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Panel 2: hilo de mensajes + respuestas enlatadas */}
        <div className="flex max-h-[70vh] min-h-[50vh] flex-col oled-card !p-0 xl:col-span-6">
          {selected == null ? (
            <p className="p-6 text-sm text-zinc-500">Selecciona una conversación.</p>
          ) : (
            <>
              {canEdit && templates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-3 py-2">
                  <span className="mr-1 py-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">Plantillas:</span>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.bodyText ?? undefined}
                      onClick={() => setDraft(t.bodyText ?? '')}
                      className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                    >
                      /{t.name}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesContainerRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMoreMessages()}
                    disabled={loadingOlder}
                    className="mx-auto mb-2 border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 font-mono disabled:opacity-50"
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
              {canEdit && (
                <div className="flex gap-2 border-t border-zinc-800 p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Escribe tu respuesta… (Enter para enviar)"
                    aria-label="Escribe tu respuesta"
                    className="min-h-[3rem] flex-1 border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
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
                    className="self-end bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider font-mono text-black disabled:opacity-50"
                  >
                    {sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel 3: contexto del contacto + notas privadas + acciones */}
        <div className="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto xl:col-span-3">
          {selectedConv == null ? (
            <div className="oled-card p-4 text-sm text-zinc-500">El contexto del contacto aparece aquí.</div>
          ) : (
            <>
              <div className="oled-card space-y-2 p-4">
                <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Contacto</p>
                <p className="text-sm font-bold text-white">{convName(selectedConv)}</p>
                <p className="text-xs font-mono text-zinc-400">{selectedConv.contactAddress}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">{selectedConv.channel}</span>
                  {typeof selectedConv.lead === 'object' && selectedConv.lead && (
                    <a
                      href={`/workspace/crm?lead=${selectedConv.lead.id}`}
                      className="border border-sky-800 bg-sky-950/60 px-1.5 py-0.5 text-[10px] font-mono text-sky-300 hover:text-sky-200"
                    >
                      Lead: {selectedConv.lead.fullName} →
                    </a>
                  )}
                  {typeof selectedConv.client === 'object' && selectedConv.client && (
                    <span className="border border-emerald-800 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                      Cliente: {selectedConv.client.name}
                    </span>
                  )}
                  <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                    Ventana 24h: {selectedConv.lastInboundAt && nowTs - new Date(selectedConv.lastInboundAt).getTime() < 24 * 3600_000 ? 'activa' : 'vencida'}
                  </span>
                </div>
              </div>

              {canEdit && (
                <div className="oled-card space-y-3 p-4">
                  <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Gestión (Chatwoot)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['open', 'pending', 'resolved'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={savingMeta || (selectedConv.status ?? 'open') === s}
                        onClick={() => void patchConversation(selectedConv.id, { status: s })}
                        className={`px-2 py-1 text-[10px] font-mono uppercase transition disabled:opacity-40 ${
                          (selectedConv.status ?? 'open') === s ? 'bg-white text-black' : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] font-mono uppercase text-zinc-400">
                      Prioridad
                      <select
                        value={selectedConv.priority ?? 'media'}
                        disabled={savingMeta}
                        onChange={(e) => void patchConversation(selectedConv.id, { priority: e.target.value })}
                        className="border border-zinc-800 bg-black px-2 py-1 text-xs text-zinc-200"
                      >
                        {Object.entries(PRIORITY_META).map(([value, meta]) => (
                          <option key={value} value={value}>{meta.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-mono uppercase text-zinc-400">
                      Asignar a
                      <select
                        value={typeof selectedConv.assignee === 'object' && selectedConv.assignee ? selectedConv.assignee.id : ''}
                        disabled={savingMeta}
                        onChange={(e) => void patchConversation(selectedConv.id, { assignee: e.target.value || null })}
                        className="border border-zinc-800 bg-black px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="">Sin asignar</option>
                        {team.map((u) => (
                          <option key={u.id} value={u.id}>{personName(u)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-[10px] font-mono uppercase text-zinc-400">
                    Snooze hasta
                    <input
                      key={`snooze-${selectedConv.id}`}
                      type="datetime-local"
                      defaultValue={selectedConv.snoozeUntil ? new Date(selectedConv.snoozeUntil).toISOString().slice(0, 16) : ''}
                      disabled={savingMeta}
                      onChange={(e) => void patchConversation(selectedConv.id, { snoozeUntil: e.target.value || null })}
                      className="border border-zinc-800 bg-black px-2 py-1 text-xs text-zinc-200"
                    />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {LABELS.map((l) => {
                      const active = selectedConv.labels?.includes(l) ?? false
                      return (
                        <button
                          key={l}
                          type="button"
                          disabled={savingMeta}
                          onClick={() => {
                            const next = active
                              ? (selectedConv.labels ?? []).filter((x) => x !== l)
                              : [...(selectedConv.labels ?? []), l]
                            void patchConversation(selectedConv.id, { labels: next })
                          }}
                          className={`px-2 py-0.5 text-[10px] font-mono transition disabled:opacity-40 ${
                            active ? 'bg-sky-950 text-sky-300 border border-sky-700' : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {l}
                        </button>
                      )
                    })}
                  </div>
                  {snoozeActive && (
                    <p className="text-[10px] font-mono text-amber-300">
                      Snooze activo hasta {snoozed?.toLocaleString()} — oculta de Abiertas.
                    </p>
                  )}
                </div>
              )}

              <div className="oled-card space-y-2.5 p-4">
                <p className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Notas internas (privadas)</p>
                {notes.length === 0 && <p className="text-xs text-zinc-500">Sin notas todavía.</p>}
                {notes.map((n) => (
                  <div key={n.id} className="border-l-2 border-amber-700/60 bg-zinc-900/60 px-2.5 py-2">
                    <p className="whitespace-pre-wrap text-xs text-zinc-200">{n.body}</p>
                    <p className="mt-1 text-[9px] font-mono text-zinc-500">
                      {personName(n.author)} · {timeShort(n.createdAt)}
                    </p>
                  </div>
                ))}
                {canEdit && (
                  <div className="space-y-1.5">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Nota interna para el equipo…"
                      aria-label="Nueva nota interna"
                      className="min-h-[2.5rem] w-full border border-zinc-800 bg-black px-2.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void addNote()}
                      disabled={savingMeta || !noteDraft.trim()}
                      className="border border-zinc-700 bg-zinc-900 px-3 py-1 text-[10px] font-mono uppercase text-zinc-200 transition hover:text-white disabled:opacity-50"
                    >
                      Guardar nota
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
