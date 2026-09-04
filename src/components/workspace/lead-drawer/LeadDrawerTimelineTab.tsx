'use client'

import { useState, type FormEvent } from 'react'
import {
  Calendar,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Send,
} from 'lucide-react'

import type { Activity } from '@/payload-types'
import { addLeadActivityInSituAction, type LeadActivityType } from '@/lib/crm-pipeline-actions'

const ACTIVITY_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string }
> = {
  nota: { label: 'Nota', icon: FileText, color: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
  llamada: { label: 'Llamada', icon: Phone, color: 'text-sky-400 bg-sky-950/60 border-sky-800' },
  reunion: { label: 'Reunión', icon: Calendar, color: 'text-purple-400 bg-purple-950/60 border-purple-800' },
  email: { label: 'Email', icon: Mail, color: 'text-blue-400 bg-blue-950/60 border-blue-800' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
  otro: { label: 'Otro', icon: FileText, color: 'text-zinc-400 bg-zinc-800 border-zinc-700' },
}

export function LeadDrawerTimelineTab({
  leadId,
  activities,
  canEdit,
  onActivityAdded,
}: {
  leadId: number
  activities: Activity[]
  canEdit: boolean
  onActivityAdded?: () => void
}) {
  const [summary, setSummary] = useState('')
  const [type, setType] = useState<LeadActivityType>('nota')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canEdit || submitting) return
    const trimmed = summary.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)
    const result = await addLeadActivityInSituAction({
      leadId,
      summary: trimmed,
      type,
    })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSummary('')
    onActivityAdded?.()
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Formulario rápido para registrar interacciones */}
      {canEdit && (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-2.5 border border-zinc-800 bg-zinc-950 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-300 font-semibold">
              <Plus size={13} className="text-emerald-400" /> Registrar Actividad In-Situ
            </span>
            <div className="flex items-center gap-1">
              {(['nota', 'llamada', 'reunion', 'email', 'whatsapp'] as const).map((t) => {
                const config = ACTIVITY_TYPE_CONFIG[t]
                const Icon = config.icon
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded transition ${
                      active
                        ? 'bg-white text-black font-bold'
                        : 'text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800'
                    }`}
                    title={config.label}
                  >
                    <Icon size={11} />
                    <span className="hidden sm:inline">{config.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ej: Acordamos enviar propuesta antes del viernes..."
              maxLength={500}
              required
              className="flex-1 border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none font-sans"
            />
            <button
              type="submit"
              disabled={submitting || !summary.trim()}
              className="inline-flex items-center gap-1.5 border border-white bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-zinc-200 disabled:opacity-50 shrink-0"
            >
              {submitting ? (
                <Loader2 size={12} className="animate-spin text-black" />
              ) : (
                <Send size={12} />
              )}
              Registrar
            </button>
          </div>

          {error && (
            <div className="border border-red-800 bg-red-900/30 px-3 py-1.5 text-xs text-red-300 font-mono" role="alert">
              {error}
            </div>
          )}
        </form>
      )}

      {/* Lista cronológica del Timeline */}
      {activities.length === 0 ? (
        <p className="text-xs text-zinc-500 font-mono">Todavía no hay actividad registrada para este lead.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l border-zinc-800 pl-4 ml-2">
          {activities.map((activity) => {
            const config = ACTIVITY_TYPE_CONFIG[activity.type] ?? ACTIVITY_TYPE_CONFIG.otro
            const Icon = config.icon

            return (
              <li key={activity.id} className="relative group">
                <span
                  className={`absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${config.color}`}
                  aria-hidden="true"
                >
                  <Icon size={9} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <strong className="text-xs text-white font-medium leading-snug">{activity.summary}</strong>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                    <span className="capitalize">{config.label}</span>
                    <span>·</span>
                    <span>
                      {new Intl.DateTimeFormat('es', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(activity.occurredAt))}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

