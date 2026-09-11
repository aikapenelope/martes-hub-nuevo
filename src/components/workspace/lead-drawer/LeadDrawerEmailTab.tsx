'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { sendLeadEmailAction } from '@/lib/crm-pipeline-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { EmailLogItem } from './types'

const inputCls =
  'w-full rounded-md border border-input bg-background/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors font-sans'
const labelCls = 'flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground'

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
    return <p className="text-xs text-muted-foreground">Este lead no tiene un email registrado — agrégalo en &quot;Datos CRM&quot;.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <form onSubmit={(event) => void onSend(event)} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
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
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </div>
          )}
          {feedback && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400 font-medium" role="status">
              {feedback}
            </div>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={sending}
            className="self-start font-semibold"
          >
            {sending ? 'Enviando…' : 'Enviar correo'}
          </Button>
        </form>
      )}

      <div>
        <h3 className="mb-2 text-[11px] font-medium text-muted-foreground">Correos enviados</h3>
        {!logsLoaded ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin correos registrados todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-xs font-medium text-foreground">{log.subject}</strong>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase font-mono">
                    {log.status}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">
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
