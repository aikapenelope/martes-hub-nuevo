'use client'

/**
 * CrmLeadDrawer — ficha 360° del lead, montada dentro del `Drawer` lateral
 * que abre `CrmPipelineWorkspace` al hacer clic en una tarjeta del Kanban.
 * Carga sus datos vía la REST API nativa de Payload (mismo patrón que
 * `InboxPage`: `fetch('/api/<collection>', { credentials: 'include' })`),
 * que aplica el mismo control de acceso que la Local API sin
 * `overrideAccess` — cero endpoints custom para leer.
 *
 * Pestañas: WhatsApp y Email/Copiloto IA se completan en los siguientes
 * incrementos de este mismo componente; Timeline y Datos CRM ya son
 * funcionales.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Clock3, Mail, MessageCircle, Pencil, Send, Sparkles } from 'lucide-react'

import {
  quickReplyLeadChatAction,
  sendLeadEmailAction,
  summarizeLeadWithAIAction,
  updateLeadFieldsAction,
} from '@/lib/crm-pipeline-actions'
import type { Activity, ConversationSummary, Lead, Segment, User } from '@/payload-types'

type TabKey = 'whatsapp' | 'email' | 'ai' | 'timeline' | 'datos'

const TABS: { key: TabKey; label: string; icon: typeof Mail }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'ai', label: 'Copiloto IA', icon: Sparkles },
  { key: 'timeline', label: 'Timeline', icon: Clock3 },
  { key: 'datos', label: 'Datos CRM', icon: Pencil },
]

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

interface LeadDrawerData {
  lead: Lead
  activities: Activity[]
}

export function CrmLeadDrawer({
  leadId,
  canEdit,
  assignees,
  segments,
  onUpdated,
}: {
  leadId: number
  canEdit: boolean
  assignees: User[]
  segments: Segment[]
  onUpdated?: () => void
}) {
  const [tab, setTab] = useState<TabKey>('whatsapp')
  const [data, setData] = useState<LeadDrawerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const [leadRes, activitiesRes] = await Promise.all([
          fetch(`/api/leads/${leadId}?depth=1`, { credentials: 'include' }),
          fetch(`/api/activities?depth=1&limit=25&sort=-occurredAt&where[lead][equals]=${leadId}`, {
            credentials: 'include',
          }),
        ])
        if (!leadRes.ok) throw new Error('No se pudo cargar el lead')
        const lead = (await leadRes.json()) as Lead
        const activitiesJson = (await activitiesRes.json()) as { docs: Activity[] }
        if (active) setData({ lead, activities: activitiesJson.docs })
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error cargando la ficha')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [leadId])

  return (
    <div className="flex h-full flex-col gap-3">
      <nav className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2" aria-label="Secciones de la ficha">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider transition ${
              tab === key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </nav>

      {loading && <p className="text-xs font-mono text-zinc-500">Cargando ficha…</p>}
      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}

      {data && !loading && (
        <div className="flex-1 overflow-y-auto">
          {tab === 'datos' && (
            <CrmDataTab lead={data.lead} canEdit={canEdit} assignees={assignees} segments={segments} onSaved={onUpdated} />
          )}
          {tab === 'timeline' && <TimelineTab activities={data.activities} />}
          {tab === 'whatsapp' && <WhatsAppTab leadId={leadId} canEdit={canEdit} />}
          {tab === 'email' && <EmailTab leadId={leadId} email={data.lead.email} canEdit={canEdit} />}
          {tab === 'ai' && <AiCopilotTab leadId={leadId} canEdit={canEdit} />}
        </div>
      )}
    </div>
  )
}

interface ConversationInfo {
  id: number
  contactAddress: string
  lastInboundAt: string | null
}

interface MessageItem {
  id: number
  direction: 'inbound' | 'outbound'
  text: string | null
  type: string
  sentAt: string | null
}

/** Chat en vivo del lead: mismo patrón REST de `InboxPage`, envío vía `quickReplyLeadChatAction`. */
function WhatsAppTab({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
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

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

interface EmailLogItem {
  id: number
  to: string
  subject: string
  status: string
  createdAt: string
}

/** Emailing directo vía Resend (`sendLeadEmailAction`); histórico leído por `to` en `email-log`. */
function EmailTab({ leadId, email, canEdit }: { leadId: number; email: string | null | undefined; canEdit: boolean }) {
  const [logs, setLogs] = useState<EmailLogItem[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      if (!email) {
        if (active) setLogsLoaded(true)
        return
      }
      const res = await fetch(`/api/email-log?limit=10&sort=-createdAt&where[to][equals]=${encodeURIComponent(email)}`, {
        credentials: 'include',
      })
      const json = (await res.json()) as { docs: EmailLogItem[] }
      if (active) {
        setLogs(json.docs)
        setLogsLoaded(true)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [email])

  async function refreshLogs(): Promise<void> {
    if (!email) return
    const res = await fetch(`/api/email-log?limit=10&sort=-createdAt&where[to][equals]=${encodeURIComponent(email)}`, {
      credentials: 'include',
    })
    const json = (await res.json()) as { docs: EmailLogItem[] }
    setLogs(json.docs)
  }

  async function onSend(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!subject.trim() || !body.trim() || sending) return
    setSending(true)
    setError(null)
    setFeedback(null)
    const bodyHtml = body
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('')
    const result = await sendLeadEmailAction(leadId, { subject: subject.trim(), bodyHtml })
    setSending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFeedback('Correo enviado.')
    setSubject('')
    setBody('')
    void refreshLogs()
  }

  if (!email) {
    return <p className="text-xs text-zinc-500">Este lead no tiene un email registrado — agrégalo en &quot;Datos CRM&quot;.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form onSubmit={(event) => void onSend(event)} className="flex flex-col gap-2 border border-zinc-800 bg-black p-3">
          <label className={labelCls}>
            Para
            <input value={email} disabled className={inputCls} />
          </label>
          <label className={labelCls}>
            Asunto
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              required
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Cuerpo
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              required
              className={inputCls}
            />
          </label>
          {error && (
            <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
              {error}
            </div>
          )}
          {feedback && (
            <div className="border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300" role="status">
              {feedback}
            </div>
          )}
          <button
            type="submit"
            disabled={sending}
            className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
          >
            {sending ? 'Enviando…' : 'Enviar correo'}
          </button>
        </form>
      )}

      <div>
        <h3 className="mb-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">Correos enviados</h3>
        {!logsLoaded ? (
          <p className="text-xs font-mono text-zinc-500">Cargando…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-zinc-500">Sin correos registrados todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="border border-zinc-800 bg-black p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-xs text-white">{log.subject}</strong>
                  <span className="shrink-0 text-[9px] font-mono uppercase text-zinc-500">{log.status}</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(log.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const SENTIMENT_LABEL: Record<ConversationSummary['sentiment'], string> = {
  positivo: 'Positivo',
  neutral: 'Neutral',
  negativo: 'Negativo',
  en_riesgo: 'En riesgo',
}

const SENTIMENT_CLASS: Record<ConversationSummary['sentiment'], string> = {
  positivo: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  negativo: 'bg-red-900/50 text-red-400 border-red-800',
  en_riesgo: 'bg-amber-900/50 text-amber-300 border-amber-800',
}

/** Copiloto IA: dispara `summarizeLeadWithAIAction` y lista el historial de `conversation-summaries` del lead. */
function AiCopilotTab({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
  const [summaries, setSummaries] = useState<ConversationSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      const res = await fetch(`/api/conversation-summaries?depth=0&limit=5&sort=-createdAt&where[lead][equals]=${leadId}`, {
        credentials: 'include',
      })
      const json = (await res.json()) as { docs: ConversationSummary[] }
      if (active) {
        setSummaries(json.docs)
        setLoaded(true)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [leadId])

  async function generate(): Promise<void> {
    setGenerating(true)
    setError(null)
    const result = await summarizeLeadWithAIAction(leadId)
    setGenerating(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const res = await fetch(`/api/conversation-summaries?depth=0&limit=5&sort=-createdAt&where[lead][equals]=${leadId}`, {
      credentials: 'include',
    })
    const json = (await res.json()) as { docs: ConversationSummary[] }
    setSummaries(json.docs)
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating}
          className="inline-flex items-center justify-center gap-1.5 self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
        >
          <Sparkles size={14} /> {generating ? 'Generando…' : 'Generar resumen inteligente'}
        </button>
      )}

      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}

      {!loaded ? (
        <p className="text-xs font-mono text-zinc-500">Cargando…</p>
      ) : summaries.length === 0 ? (
        <p className="text-xs text-zinc-500">Todavía no hay resúmenes de IA para este lead.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {summaries.map((summary) => (
            <li key={summary.id} className="border border-zinc-800 bg-black p-3">
              <span className={`inline-flex border px-1.5 py-0.5 text-[9px] font-mono ${SENTIMENT_CLASS[summary.sentiment]}`}>
                {SENTIMENT_LABEL[summary.sentiment]}
              </span>
              <p className="mt-1.5 text-xs text-zinc-200">{summary.summary}</p>
              {summary.objections && <p className="mt-1 text-[10px] text-zinc-500">Objeciones: {summary.objections}</p>}
              {summary.nextSteps && <p className="mt-1 text-[10px] text-zinc-500">Próximos pasos: {summary.nextSteps}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TimelineTab({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-xs text-zinc-500">Todavía no hay actividad registrada para este lead.</p>
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-zinc-800 pl-4">
      {activities.map((activity) => (
        <li key={activity.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-white" aria-hidden="true" />
          <strong className="block text-xs text-white">{activity.summary}</strong>
          <span className="text-[10px] font-mono text-zinc-500">
            {activity.type} ·{' '}
            {new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.occurredAt))}
          </span>
        </li>
      ))}
    </ol>
  )
}

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

function CrmDataTab({
  lead,
  canEdit,
  assignees,
  segments,
  onSaved,
}: {
  lead: Lead
  canEdit: boolean
  assignees: User[]
  segments: Segment[]
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const segmentId = relId(lead.segment)
  const assignedToId = relId(lead.assignedTo)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    const form = new FormData(event.currentTarget)
    const result = await updateLeadFieldsAction(lead.id, {
      fullName: String(form.get('fullName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      segment: form.get('segment') ? Number(form.get('segment')) : null,
      estimatedValue: form.get('estimatedValue') ? Number(form.get('estimatedValue')) : null,
      assignedTo: form.get('assignedTo') ? Number(form.get('assignedTo')) : null,
      notes: String(form.get('notes') ?? ''),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFeedback('Cambios guardados.')
    onSaved?.()
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
      <fieldset disabled={!canEdit || saving} className="flex flex-col gap-3">
        <label className={labelCls}>
          Nombre
          <input name="fullName" defaultValue={lead.fullName} maxLength={160} required className={inputCls} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Teléfono
            <input name="phone" defaultValue={lead.phone ?? ''} className={inputCls} />
          </label>
          <label className={labelCls}>
            Email
            <input name="email" type="email" defaultValue={lead.email ?? ''} className={inputCls} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Rubro
            <select name="segment" defaultValue={segmentId ?? ''} className={inputCls}>
              <option value="">Sin rubro</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Valor estimado (USD)
            <input name="estimatedValue" type="number" min={0} defaultValue={lead.estimatedValue ?? ''} className={inputCls} />
          </label>
        </div>
        <label className={labelCls}>
          Agente asignado
          <select name="assignedTo" defaultValue={assignedToId ?? ''} className={inputCls}>
            <option value="">Sin asignar</option>
            {assignees.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {[agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Notas internas
          <textarea name="notes" rows={4} defaultValue={lead.notes ?? ''} className={inputCls} />
        </label>

        {error && (
          <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
            {error}
          </div>
        )}
        {feedback && (
          <div className="border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300" role="status">
            {feedback}
          </div>
        )}
        {canEdit && (
          <button
            type="submit"
            disabled={saving}
            className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </fieldset>
    </form>
  )
}
