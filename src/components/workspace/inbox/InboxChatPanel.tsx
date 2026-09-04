'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Zap,
} from 'lucide-react'

import { DEFAULT_QUICK_SNIPPETS, type QuickSnippet } from './inbox-snippets'
import type { ConvListItem } from './InboxConversationList'
import { computeWindowState } from '@/lib/crm-pipeline-window'

export interface ChatMessage {
  id: number
  direction: 'inbound' | 'outbound'
  text: string | null
  type: string
  sentAt: string | null
  statusJson?: Record<string, unknown> | null
}

function formatDateSeparator(isoDate: string | null): string {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'

  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  }).format(d)
}

function groupMessagesByDate(messages: ChatMessage[]) {
  const groups: { dateLabel: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  let currentGroup: ChatMessage[] = []

  for (const msg of messages) {
    const label = formatDateSeparator(msg.sentAt)
    if (label !== currentLabel) {
      if (currentGroup.length > 0) {
        groups.push({ dateLabel: currentLabel, messages: currentGroup })
      }
      currentLabel = label
      currentGroup = [msg]
    } else {
      currentGroup.push(msg)
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ dateLabel: currentLabel, messages: currentGroup })
  }

  return groups
}

export function InboxChatPanel({
  conversation,
  messages,
  hasMore,
  loadingOlder,
  sending,
  canEdit,
  isContextPanelOpen,
  nowTs,
  onToggleContextPanel,
  onLoadMore,
  onSendMessage,
  onStatusChange,
  onBack,
}: {
  conversation: ConvListItem
  messages: ChatMessage[]
  hasMore: boolean
  loadingOlder: boolean
  sending: boolean
  canEdit: boolean
  isContextPanelOpen: boolean
  nowTs: number
  onToggleContextPanel: () => void
  onLoadMore: () => void
  onSendMessage: (text: string) => Promise<{ ok: boolean; error?: string; needsTemplate?: boolean }>
  onStatusChange: (status: 'open' | 'pending' | 'resolved') => void
  onBack?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsTemplate, setNeedsTemplate] = useState<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const windowState = computeWindowState(conversation.lastInboundAt, conversation.lastMessageAt, nowTs)
  const isWindowActive = (windowState.windowMinutesRemaining ?? 0) > 0

  const contactName =
    (typeof conversation.client === 'object' && conversation.client?.name) ||
    (typeof conversation.lead === 'object' && conversation.lead?.fullName) ||
    conversation.contactAddress

  // Auto-scroll al final en nuevos mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])


  async function handleSend(): Promise<void> {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setError(null)
    setNeedsTemplate(false)

    const res = await onSendMessage(trimmed)
    if (res.ok) {
      setError(null)
      setNeedsTemplate(false)
      setDraft('')
      textareaRef.current?.focus()
    } else {
      setError(res.error || 'Error enviando mensaje')
      setNeedsTemplate(Boolean(res.needsTemplate))
    }
  }

  function insertSnippet(snippet: QuickSnippet) {
    setDraft((prev) => (prev ? `${prev}\n${snippet.text}` : snippet.text))
    textareaRef.current?.focus()
  }

  const messageGroups = groupMessagesByDate(messages)

  return (
    <div className="flex h-full flex-col border border-zinc-800 bg-zinc-950">
      {/* Cabecera del Chat Activo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-3 bg-zinc-950/80">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="lg:hidden inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-mono text-zinc-300 hover:text-white"
              title="Volver a la lista de conversaciones"
            >
              <ArrowLeft size={12} />
              <span>Atrás</span>
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <strong className="truncate text-sm font-bold text-white">{contactName}</strong>
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.2 text-[9px] font-mono ${
                  isWindowActive
                    ? 'border-emerald-800 bg-emerald-950/80 text-emerald-300'
                    : 'border-amber-800 bg-amber-950/80 text-amber-300'
                }`}
              >
                <Clock size={9} />
                {isWindowActive ? `Ventana 24h: ${windowState.windowMinutesRemaining}m` : 'Ventana 24h expirada'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs font-mono text-zinc-400">
              <span>{conversation.contactAddress}</span>
              {conversation.channel === 'whatsapp' && (
                <a
                  href={`https://wa.me/${conversation.contactAddress.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 hover:text-emerald-300"
                  title="Abrir en WhatsApp Web externo"
                >
                  <MessageCircle size={10} className="text-[#25d366]" />
                  <span>wa.me</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Acciones de Cabecera: Estado & Ficha CRM */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <select
              value={conversation.status ?? 'open'}
              onChange={(e) => onStatusChange(e.target.value as 'open' | 'pending' | 'resolved')}
              className="border border-zinc-800 bg-black px-2 py-1 text-xs text-zinc-300 font-mono focus:border-zinc-600 focus:outline-none"
            >
              <option value="open">Abierta</option>
              <option value="pending">Pendiente</option>
              <option value="resolved">Resuelta</option>
            </select>
          )}

          <button
            type="button"
            onClick={onToggleContextPanel}
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-mono transition ${
              isContextPanelOpen
                ? 'border-zinc-700 bg-zinc-800 text-white'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
            title={isContextPanelOpen ? 'Ocultar Ficha CRM 360°' : 'Mostrar Ficha CRM 360°'}
          >
            {isContextPanelOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
            <span className="hidden sm:inline">Ficha CRM 360°</span>
          </button>
        </div>
      </div>

      {/* Hilo de Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {hasMore && (
          <div className="text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-850 disabled:opacity-50"
            >
              {loadingOlder ? (
                <>
                  <Loader2 size={11} className="animate-spin" /> Cargando...
                </>
              ) : (
                'Cargar mensajes anteriores'
              )}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <p className="text-center text-xs font-mono text-zinc-500 py-12">
            No hay mensajes registrados en esta conversación.
          </p>
        ) : (
          messageGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              {/* Separador de Fecha */}
              <div className="relative flex items-center justify-center my-3">
                <span className="bg-zinc-950 px-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider z-10">
                  {group.dateLabel}
                </span>
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-900" />
                </div>
              </div>

              {/* Burbujas del Grupo */}
              {group.messages.map((m) => {
                const isInbound = m.direction === 'inbound'
                const isDelivered = Boolean(m.statusJson?.delivered_at || m.statusJson?.read_at)
                const isRead = Boolean(m.statusJson?.read_at)

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[80%] sm:max-w-[70%] rounded-lg px-3.5 py-2 text-xs leading-relaxed ${
                        isInbound
                          ? 'border border-zinc-800 bg-zinc-900 text-zinc-100'
                          : 'bg-white text-black font-medium'
                      }`}
                    >
                      {m.type !== 'text' && (
                        <span className="block text-[10px] font-mono opacity-70 mb-0.5">
                          [{m.type}]
                        </span>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>

                    <div
                      className={`flex items-center gap-1 mt-1 text-[9px] font-mono ${
                        isInbound ? 'text-zinc-500 ml-1' : 'text-zinc-500 mr-1'
                      }`}
                    >
                      <span>
                        {m.sentAt
                          ? new Date(m.sentAt).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                      {!isInbound && (
                        <span>
                          {isRead ? (
                            <span title="Leído"><CheckCheck size={11} className="text-sky-400" /></span>
                          ) : isDelivered ? (
                            <span title="Entregado"><CheckCheck size={11} className="text-zinc-400" /></span>
                          ) : (
                            <span title="Enviado"><Check size={11} className="text-zinc-500" /></span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Barra de Respuestas Rápidas (Snippets Locales) */}
      {canEdit && (
        <div className="flex flex-col border-t border-zinc-800 bg-zinc-950 p-3 gap-2">
          {/* Fila de Chips de Snippets Rápidos */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider shrink-0 mr-1">
              <Zap size={11} className="text-amber-400" /> Atajos:
            </span>
            {DEFAULT_QUICK_SNIPPETS.map((snippet) => (
              <button
                key={snippet.id}
                type="button"
                onClick={() => insertSnippet(snippet)}
                className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono text-zinc-300 hover:border-zinc-600 hover:text-white hover:bg-zinc-850 transition shrink-0"
                title={`${snippet.label}: "${snippet.text}"`}
              >
                <span className="font-bold text-emerald-400">{snippet.shortcut}</span>
                <span>{snippet.label}</span>
              </button>
            ))}
          </div>

          {/* Banner si la ventana 24h expiró o la acción requirió plantilla */}
          {(!isWindowActive || needsTemplate) && (
            <div className="border border-amber-800/80 bg-amber-950/40 px-3 py-1.5 text-[11px] font-mono text-amber-300 rounded">
              ⚠️ La ventana de 24 horas de Meta ha vencido. Solo se pueden enviar plantillas pre-aprobadas si se trata de WhatsApp oficial.
            </div>
          )}

          {error && !needsTemplate && (
            <div className="border border-red-800 bg-red-900/30 px-3 py-1.5 text-xs text-red-300 font-mono rounded">
              {error}
            </div>
          )}

          {/* Área de Redacción y Envío */}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para salto de línea)"
              rows={2}
              className="flex-1 border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none font-sans rounded resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void handleSend()}
              className="inline-flex items-center gap-1.5 rounded border border-white bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider font-mono text-black transition hover:bg-zinc-200 disabled:opacity-50 shrink-0 h-[42px]"
            >
              {sending ? (
                <Loader2 size={13} className="animate-spin text-black" />
              ) : (
                <Send size={13} />
              )}
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
