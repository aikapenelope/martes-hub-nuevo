'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { quickReplyLeadChatAction } from '@/lib/crm-pipeline-actions'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { ConversationInfo, MessageItem } from './types'

const inputCls =
  'w-full rounded-md border border-input bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors font-sans resize-none'

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

  // Clave de idempotencia POR BORRADOR: se reutiliza en reintentos del mismo
  // texto (no duplica entrega) y se regenera tras el éxito o al cambiar el texto.
  const draftKeyRef = useRef<{ text: string; key: string } | null>(null)

  function newIdempotencyKey(): string {
    const random =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)
    return `msg_${Date.now()}_${random}`
  }

  async function send(): Promise<void> {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    if (!draftKeyRef.current || draftKeyRef.current.text !== text) {
      draftKeyRef.current = { text, key: newIdempotencyKey() }
    }
    const result = await quickReplyLeadChatAction(leadId, text, draftKeyRef.current.key)
    setSending(false)
    if (!result.ok) {
      setError(result.needsTemplate ? `${result.error} (usa una plantilla aprobada desde /admin)` : result.error)
      return
    }
    setDraft('')
    draftKeyRef.current = null
    if (conversation) void refreshMessages(conversation.id)
  }

  if (!conversationLoaded) return <p className="text-xs text-muted-foreground">Cargando conversación…</p>
  if (!conversation) {
    return <p className="text-xs text-muted-foreground">Este lead todavía no tiene una conversación de WhatsApp/Instagram.</p>
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin mensajes todavía.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] px-3.5 py-2 text-xs leading-relaxed ${
                message.direction === 'inbound'
                  ? 'rounded-2xl rounded-tl-xs bg-muted/70 text-foreground border border-border/40'
                  : 'ml-auto rounded-2xl rounded-tr-xs bg-primary text-primary-foreground font-medium shadow-xs'
              }`}
            >
              {message.text || `[${message.type}]`}
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="flex items-end gap-2 border-t border-border/60 pt-2.5">
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
          <Button
            type="button"
            size="icon"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            aria-label="Enviar"
            className="size-8 shrink-0 mb-0.5"
          >
            <Send size={13} />
          </Button>
        </div>
      )}
    </div>
  )
}
