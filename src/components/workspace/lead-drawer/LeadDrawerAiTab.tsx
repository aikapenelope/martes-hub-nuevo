'use client'

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { summarizeLeadWithAIAction } from '@/lib/crm-pipeline-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ConversationSummary } from '@/payload-types'

const SENTIMENT_LABEL: Record<ConversationSummary['sentiment'], string> = {
  positivo: 'Positivo',
  neutral: 'Neutral',
  negativo: 'Negativo',
  en_riesgo: 'En riesgo',
}

const SENTIMENT_CLASS: Record<ConversationSummary['sentiment'], string> = {
  positivo: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  neutral: 'text-muted-foreground border-border bg-muted/60',
  negativo: 'text-destructive border-destructive/30 bg-destructive/10',
  en_riesgo: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
}

/** Copiloto IA: dispara `summarizeLeadWithAIAction` y lista el historial de `conversation-summaries` del lead. */
export function LeadDrawerAiTab({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
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
        <Button
          type="button"
          size="sm"
          onClick={() => void generate()}
          disabled={generating}
          className="gap-1.5 self-start font-semibold"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'Generando…' : 'Generar resumen inteligente'}
        </Button>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          {error}
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : summaries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay resúmenes de IA para este lead.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {summaries.map((summary) => (
            <li key={summary.id} className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold uppercase tracking-wider ${SENTIMENT_CLASS[summary.sentiment]}`}
                >
                  {SENTIMENT_LABEL[summary.sentiment]}
                </Badge>
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">{summary.summary}</p>
              {summary.objections && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive/90">
                  <span className="font-medium">Objeciones:</span> {summary.objections}
                </div>
              )}
              {summary.nextSteps && (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-primary font-medium">
                  <span>Próximos pasos:</span> {summary.nextSteps}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
