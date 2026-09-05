'use client'

/**
 * InboxWorkspace — Inbox Omnicanal Unificado 360° estilo Chatwoot:
 *  1. Panel Izquierdo: Lista de conversaciones reactiva con filtros por canal
 *     (WhatsApp / Instagram / Web), estado, búsqueda en vivo y semáforo 24h.
 *  2. Panel Central: Hilo de mensajes cronológico, respuestas rápidas con
 *     snippets locales (/saludo, /pago, /horario) y envío directo vía OpenBSP.
 *  3. Panel Derecho: Ficha CRM 360° en vivo (Lead con conversión in-situ, Cliente,
 *     Copiloto IA con generación de resúmenes, asignación y notas privadas).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  InboxConversationList,
  type ConvListItem,
} from './inbox/InboxConversationList'
import {
  InboxChatPanel,
  type ChatMessage,
} from './inbox/InboxChatPanel'
import {
  InboxCrmContextPanel,
  type ConversationNote,
  type TeamMember,
} from './inbox/InboxCrmContextPanel'
import {
  getInboxAssigneesAction,
  replyConversationAction,
  updateConversationMetaAction,
} from '@/lib/inbox-actions'

export function InboxWorkspace({
  canEdit,
  tenantId: _tenantId,
  initialConversationId,
  initialTeam,
}: {
  canEdit: boolean
  tenantId: number
  initialConversationId?: number | null
  initialTeam?: TeamMember[]
}) {
  const [conversations, setConversations] = useState<ConvListItem[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<'open' | 'pending' | 'resolved' | 'all'>('open')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedConv, setSelectedConv] = useState<ConvListItem | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [notes, setNotes] = useState<ConversationNote[]>([])
  const [team, setTeam] = useState<TeamMember[]>(initialTeam || [])
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true)
  const [nowTs, setNowTs] = useState(0)
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'crm'>('list')

  const latestConvRef = useRef<number | null>(null)

  // Avanzar tiempo de referencia periódicamente (30s) para actualizar etiquetas relativas y ventana 24h
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now())
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const buildConvParams = useCallback((filter: typeof statusFilter): string => {
    const params = new URLSearchParams({ limit: '60', sort: '-lastMessageAt', depth: '1' })
    if (filter === 'pending' || filter === 'resolved') {
      params.set('where[status][equals]', filter)
    } else if (filter === 'open') {
      params.set('where[and][0][status][equals]', 'open')
      params.set('where[and][1][or][0][snoozeUntil][exists]', 'false')
      params.set('where[and][1][or][1][snoozeUntil][less_than]', new Date().toISOString())
    }
    return params.toString()
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?${buildConvParams(statusFilter)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { docs: ConvListItem[] }
        setConversations(data.docs)
        setNowTs(Date.now())
      }
    } catch {
      // Manejo silencioso de error de red
    }
  }, [buildConvParams, statusFilter])

  const loadThread = useCallback(async (id: number, limit = 50) => {
    try {
      const res = await fetch(`/api/messages?limit=${limit}&sort=-sentAt&where[conversation][equals]=${id}`, {
        credentials: 'include',
      })
      if (latestConvRef.current !== id) return
      if (res.ok) {
        const data = (await res.json()) as { docs: ChatMessage[]; totalDocs: number }
        setMessages([...data.docs].reverse())
        setHasMore(data.totalDocs > data.docs.length)
      }
    } catch {
      // Manejo silencioso
    }
  }, [])

  const loadNotes = useCallback(async (id: number) => {
    try {
      const res = await fetch(
        `/api/conversation-notes?limit=25&sort=-createdAt&depth=1&where[conversation][equals]=${id}`,
        { credentials: 'include' },
      )
      if (latestConvRef.current !== id) return
      if (res.ok) {
        const data = (await res.json()) as { docs: ConversationNote[] }
        setNotes(data.docs)
      }
    } catch {
      // Manejo silencioso
    }
  }, [])

  // Carga inicial y recarga al cambiar statusFilter
  useEffect(() => {
    let cancelled = false
    fetch(`/api/conversations?${buildConvParams(statusFilter)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { docs: ConvListItem[] } | null) => {
        if (!cancelled && data) {
          setConversations(data.docs)
          setNowTs(Date.now())
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [statusFilter, buildConvParams])

  // Carga fallback de usuarios asignables tenant-aware si no vienen en initialTeam
  useEffect(() => {
    if (initialTeam && initialTeam.length > 0) return
    let cancelled = false
    getInboxAssigneesAction()
      .then((users) => {
        if (!cancelled && users) setTeam(users)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [initialTeam])

  const handleSelect = useCallback(
    (conv: ConvListItem) => {
      latestConvRef.current = conv.id
      setSelectedId(conv.id)
      setSelectedConv(conv)
      setMobileView('chat')
      setNotes([])
      void loadThread(conv.id)
      void loadNotes(conv.id)
    },
    [loadThread, loadNotes],
  )

  // Manejo de Deep link desde el CRM (?c=<id>)
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (!initialConversationId || deepLinkApplied.current || !conversations) return
    deepLinkApplied.current = true
    const found = conversations.find((d) => d.id === initialConversationId)
    if (found) {
      queueMicrotask(() => handleSelect(found))
      return
    }
    fetch(`/api/conversations/${initialConversationId}?depth=1`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: ConvListItem | null) => {
        if (doc?.id) handleSelect(doc)
      })
      .catch(() => {})
  }, [initialConversationId, conversations, handleSelect])

  const loadMoreMessages = async () => {
    if (!selectedId || loadingOlder) return
    setLoadingOlder(true)
    await loadThread(selectedId, messages.length + 50)
    setLoadingOlder(false)
  }

  const handleSendMessage = async (
    text: string,
    idempotencyKey?: string,
  ): Promise<{ ok: boolean; error?: string; needsTemplate?: boolean }> => {
    if (!selectedId || sending) {
      return { ok: false, error: 'No hay conversación activa' }
    }
    setSending(true)
    try {
      const res = await replyConversationAction(selectedId, text, idempotencyKey)
      setSending(false)
      if (res.ok) {
        await loadThread(selectedId)
        await loadConversations()
        return { ok: true }
      }
      return { ok: false, error: res.error, needsTemplate: res.needsTemplate }
    } catch (err) {
      setSending(false)
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error al enviar mensaje',
      }
    }
  }

  const handleStatusChange = async (status: 'open' | 'pending' | 'resolved') => {
    if (!selectedId || !canEdit) return
    const res = await updateConversationMetaAction(selectedId, { status })
    if (res.ok) {
      setSelectedConv((prev) => (prev ? { ...prev, status } : prev))
      await loadConversations()
    }
  }

  const handleReloadSelected = async () => {
    if (!selectedId) return
    const res = await fetch(`/api/conversations/${selectedId}?depth=1`, { credentials: 'include' })
    if (res.ok) {
      const updated = (await res.json()) as ConvListItem
      setSelectedConv(updated)
    }
    await loadConversations()
  }

  const handleToggleContext = () => {
    setIsContextPanelOpen((prev) => !prev)
    setMobileView((prev) => (prev === 'crm' ? 'chat' : 'crm'))
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-2">
      {/* Título y resumen superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Módulo 3 · Mensajería Integrada
          </p>
          <h1 className="text-base font-bold text-white">Inbox Omnicanal Unificado</h1>
        </div>
      </div>

      {/* Split-View Operativo de 3 Paneles con modo responsivo real */}
      <div className="flex flex-1 gap-2 min-h-0 overflow-hidden">
        {/* Panel 1: Lista de Conversaciones */}
        <div
          className={`${
            mobileView === 'list' ? 'block w-full' : 'hidden'
          } lg:block lg:w-80 xl:w-96 shrink-0 h-full`}
        >
          <InboxConversationList
            conversations={conversations}
            selectedId={selectedId}
            statusFilter={statusFilter}
            nowTs={nowTs}
            onStatusFilterChange={setStatusFilter}
            onSelect={handleSelect}
          />
        </div>

        {/* Panel 2: Chat Activo */}
        <div
          className={`${
            mobileView === 'chat' ? 'block w-full' : 'hidden'
          } lg:block flex-1 h-full min-w-0`}
        >
          {selectedConv ? (
            <InboxChatPanel
              key={selectedConv.id}
              conversation={selectedConv}
              messages={messages}
              hasMore={hasMore}
              loadingOlder={loadingOlder}
              sending={sending}
              canEdit={canEdit}
              isContextPanelOpen={isContextPanelOpen}
              nowTs={nowTs}
              onToggleContextPanel={handleToggleContext}
              onLoadMore={() => void loadMoreMessages()}
              onSendMessage={handleSendMessage}
              onStatusChange={(s) => void handleStatusChange(s)}
              onBack={() => setMobileView('list')}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center border border-zinc-800 bg-zinc-950 p-6 text-center">
              <p className="text-sm font-mono text-zinc-400">Selecciona una conversación del panel izquierdo</p>
              <p className="text-xs font-mono text-zinc-600 mt-1">
                Respuestas rápidas, historial y contexto comercial 360° en vivo.
              </p>
            </div>
          )}
        </div>

        {/* Panel 3: Ficha CRM 360° y Notas Privadas (Keyed por conversation.id) */}
        {selectedConv && (
          <div
            className={`${
              mobileView === 'crm' ? 'block w-full' : 'hidden'
            } ${isContextPanelOpen ? 'lg:block' : 'lg:hidden'} lg:w-80 xl:w-96 shrink-0 h-full`}
          >
            <InboxCrmContextPanel
              key={selectedConv.id}
              conversation={selectedConv}
              notes={notes}
              team={team}
              canEdit={canEdit}
              onNoteAdded={() => void loadNotes(selectedConv.id)}
              onMetaUpdated={() => void handleReloadSelected()}
              onBack={() => setMobileView('chat')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
