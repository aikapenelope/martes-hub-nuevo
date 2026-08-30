'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { sendLeadEmailAction } from '@/lib/crm-pipeline-actions'
import type { EmailLogItem } from './types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Emailing directo vía Resend (`sendLeadEmailAction`); histórico leído por `to` en `email-log`. */
export function LeadDrawerEmailTab({
  leadId,
  email,
  canEdit,
}: {
  leadId: number
  email: string | null | undefined
  canEdit: boolean
}) {
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
