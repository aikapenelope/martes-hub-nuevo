'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { summarizeLeadWithAIAction } from '@/lib/crm-pipeline-actions'
import type { ConversationSummary } from '@/payload-types'

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
