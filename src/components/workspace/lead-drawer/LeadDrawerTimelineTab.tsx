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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACTIVITY_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string }
> = {
  nota: { label: 'Nota', icon: FileText, color: 'text-muted-foreground bg-muted border-border' },
  llamada: { label: 'Llamada', icon: Phone, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  reunion: { label: 'Reunión', icon: Calendar, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  email: { label: 'Email', icon: Mail, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  otro: { label: 'Otro', icon: FileText, color: 'text-muted-foreground bg-muted border-border' },
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
          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Plus size={13} className="text-emerald-400" /> Registrar Actividad In-Situ
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {(['nota', 'llamada', 'reunion', 'email', 'whatsapp'] as const).map((t) => {
                const config = ACTIVITY_TYPE_CONFIG[t]
                const Icon = config.icon
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      active
                        ? 'bg-foreground text-background font-semibold shadow-xs'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground border border-border/40'
                    )}
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
              className="flex-1 rounded-md border border-input bg-background/60 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none transition-colors font-sans"
            />
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !summary.trim()}
              className="gap-1.5 h-8 text-xs font-semibold shrink-0"
            >
              {submitting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              Registrar
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </div>
          )}
        </form>
      )}

      {/* Lista cronológica del Timeline */}
      {activities.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay actividad registrada para este lead.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l border-border/60 pl-4 ml-2">
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
                  <strong className="text-xs text-foreground font-medium leading-snug">{activity.summary}</strong>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
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

