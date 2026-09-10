'use client'

/**
 * InboxWorkspace — Consola Omnicanal 3 Columnas & Ficha CRM In-Situ:
 *  1. Panel Izquierdo: Lista de conversaciones reactiva con filtros por canal
 *     (WhatsApp / Instagram / Web), estado, búsqueda en vivo y semáforo 24h.
 *  2. Panel Central: Hilo de mensajes cronológico, respuestas rápidas con
 *     categorías de snippets, atajos rápidos con barra oblicua (/), y envío directo.
 *  3. Panel Derecho: Ficha CRM 360° en vivo (Lead con conversión in-situ, Cliente con
 *     resumen financiero de facturación/cobros, vinculación de contactos in-situ,
 *     Copiloto IA con generación de resúmenes e inserción directa al chat, y notas privadas).
 *  4. Lateral Drawer: Apertura de nuevas conversaciones sin modales centrados.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
  NewConversationDrawer,
  type ContactItem,
} from './inbox/NewConversationDrawer'
import { HeroAction, PageHero } from '@/components/workspace/oled'
import {
  getInboxAssigneesAction,
  replyConversationAction,
  updateConversationMetaAction,
} from '@/lib/inbox-actions'

export function InboxWorkspace({
  canEdit,
  tenantId: _tenantId,
  tenantName,
  initialConversationId,
  initialTeam,
  initialContacts = [],
}: {
  canEdit: boolean
  tenantId: number
  tenantName?: string
  initialConversationId?: number | null
  initialTeam?: TeamMember[]
  initialContacts?: ContactItem[]
}) {
  const [conversations, setConversations] = useState<ConvListItem[] | null>(null)
  const [statusFilter, setStatusFilter] = useState<'open' | 'pending' | 'resolved' | 'all'>('open')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedConv, setSelectedConv] = useState<ConvListItem | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [notes, setNotes] = useState<ConversationNote[]>([])
  const [team, setTeam] = useState<TeamMember[]>(initialTeam || [])
  const [contacts] = useState<ContactItem[]>(initialContacts)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true)
  const [nowTs, setNowTs] = useState(0)
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'crm'>('list')
  const [isNewConvOpen, setIsNewConvOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')

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
      setMessages([])
      setHasMore(false)
      setNotes([])
      setChatDraft('')
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
    idempotencyKey: string,
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

  const handleConversationCreated = async (conversationId: number) => {
    await loadConversations()
    try {
      const res = await fetch(`/api/conversations/${conversationId}?depth=1`, { credentials: 'include' })
      if (res.ok) {
        const doc = (await res.json()) as ConvListItem
        handleSelect(doc)
      }
    } catch {
      // Manejo silencioso
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-3">
      {/* 1. PageHero del Módulo Omnicanal */}
      <PageHero
        eyebrow="Consola Omnicanal · Módulo 3"
        title="Inbox Omnicanal 360°"
        description={`Gestión unificada de WhatsApp, Instagram y Web chat para ${tenantName || 'tu empresa'}.`}
        actions={
          canEdit ? (
            <HeroAction
              variant="primary"
              icon={Plus}
              onClick={() => setIsNewConvOpen(true)}
            >
              + Nueva Conversación
            </HeroAction>
          ) : undefined
        }
      />

      {/* 2. Split-View Operativo de 3 Paneles */}
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
            onNewConversation={canEdit ? () => setIsNewConvOpen(true) : undefined}
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
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onToggleContextPanel={handleToggleContext}
              onLoadMore={() => void loadMoreMessages()}
              onSendMessage={handleSendMessage}
              onStatusChange={(s) => void handleStatusChange(s)}
              onBack={() => setMobileView('list')}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center space-y-2 border border-border bg-background p-6 text-center font-mono">
              <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted text-muted-foreground">
                💬
              </div>
              <p className="text-sm font-bold text-foreground">Consola Omnicanal Lista para Despachar</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Selecciona una conversación del panel izquierdo o haz clic en{' '}
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setIsNewConvOpen(true)}
                  className="h-auto p-0 text-xs font-bold text-foreground underline hover:text-emerald-400"
                >
                  + Nueva Conversación
                </Button>{' '}
                para abrir un hilo con un cliente o prospecto.
              </p>
            </div>
          )}
        </div>

        {/* Panel 3: Ficha CRM 360° y Finanzas (Keyed por conversation.id) */}
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
              contacts={contacts}
              onNoteAdded={() => void loadNotes(selectedConv.id)}
              onMetaUpdated={() => void handleReloadSelected()}
              onInsertInChat={(text) => {
                setChatDraft((prev) => (prev ? `${prev}\n${text}` : text))
                setMobileView('chat')
              }}
              onBack={() => setMobileView('chat')}
            />
          </div>
        )}
      </div>

      {/* Drawer Lateral para Iniciar Conversación */}
      <NewConversationDrawer
        open={isNewConvOpen}
        onClose={() => setIsNewConvOpen(false)}
        contacts={contacts}
        onConversationCreated={(id) => void handleConversationCreated(id)}
      />
    </div>
  )
}
