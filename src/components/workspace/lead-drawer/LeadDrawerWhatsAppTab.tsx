'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { quickReplyLeadChatAction } from '@/lib/crm-pipeline-actions'
import type { ConversationInfo, MessageItem } from './types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'

/** Chat en vivo del lead: mismo patrón REST de InboxPage, envío vía quickReplyLeadChatAction. */
export function LeadDrawerWhatsAppTab({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
  const [conversation, setConversation] = useState<ConversationInfo | null>(null)
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      const convRes = await fetch(
        `/api/conversations?depth=0&limit=1&sort=-lastMessageAt&where[lead][equals]=${leadId}`,
        { credentials: 'include' },
      )
      const convJson = (await convRes.json()) as { docs: ConversationInfo[] }
      const conversationDoc = convJson.docs[0] ?? null
      if (!active) return
      setConversation(conversationDoc)
      setConversationLoaded(true)

      if (conversationDoc) {
        const messagesRes = await fetch(
          `/api/messages?depth=0&limit=50&sort=sentAt&where[conversation][equals]=${conversationDoc.id}`,
          { credentials: 'include' },
        )
        const messagesJson = (await messagesRes.json()) as { docs: MessageItem[] }
        if (active) setMessages(messagesJson.docs)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [leadId])

  async function refreshMessages(conversationId: number): Promise<void> {
    const res = await fetch(`/api/messages?depth=0&limit=50&sort=sentAt&where[conversation][equals]=${conversationId}`, {
      credentials: 'include',
    })
    const json = (await res.json()) as { docs: MessageItem[] }
    setMessages(json.docs)
  }

  async function send(): Promise<void> {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    const result = await quickReplyLeadChatAction(leadId, text)
    setSending(false)
    if (!result.ok) {
      setError(result.needsTemplate ? `${result.error} (usa una plantilla aprobada desde /admin)` : result.error)
      return
    }
    setDraft('')
    if (conversation) void refreshMessages(conversation.id)
  }

  if (!conversationLoaded) return <p className="text-xs font-mono text-zinc-500">Cargando conversación…</p>
  if (!conversation) {
    return <p className="text-xs text-zinc-500">Este lead todavía no tiene una conversación de WhatsApp/Instagram.</p>
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin mensajes todavía.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] px-3 py-2 text-xs ${
                message.direction === 'inbound' ? 'bg-zinc-800 text-white' : 'ml-auto bg-white text-black'
              }`}
            >
              {message.text || `[${message.type}]`}
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2 border-t border-zinc-800 pt-2">
          <label className="sr-only" htmlFor="whatsapp-reply">
            Respuesta rápida
          </label>
          <textarea
            id="whatsapp-reply"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            placeholder="Escribe tu respuesta…"
            className={inputCls}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            aria-label="Enviar"
            className="self-end px-3 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
