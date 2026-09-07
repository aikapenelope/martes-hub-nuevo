'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Copy, RefreshCw, Sparkles } from 'lucide-react'

import { generateLeadBriefAction, getLeadBriefAction, type LeadBriefPayload } from '@/lib/lead-brief-actions'

const SENTIMENT_CLS: Record<string, string> = {
  positivo: 'text-emerald-400 border-emerald-800 bg-emerald-950/60',
  neutral: 'text-zinc-300 border-zinc-700 bg-zinc-900',
  negativo: 'text-red-400 border-red-800 bg-red-950/60',
}

/**
 * Brief 360 del lead generado por IA (Attio-style AI attributes): consultable
 * (persistido en lead-briefs) y regenerable on demand. Se dispara también por
 * automatización cuando el lead sube a "caliente" (updateLeadFieldsAction).
 */
export function LeadBriefCard({ leadId, canEdit }: { leadId: number; canEdit: boolean }) {
  const [brief, setBrief] = useState<LeadBriefPayload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      try {
        const result = await getLeadBriefAction(leadId)
        if (!cancelled) setBrief(result.ok ? result.brief : null)
      } catch {
        // sin brief: la tarjeta muestra el estado vacío
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [leadId])

  const generate = useCallback(() => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await generateLeadBriefAction(leadId)
        if (result.ok) setBrief(result.brief)
        else setError(result.error)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error generando el brief')
      }
    })
  }, [leadId])

  const copyMessage = useCallback(async () => {
    if (!brief?.mensajeWhatsapp) return
    try {
      await navigator.clipboard.writeText(brief.mensajeWhatsapp)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // portapapeles bloqueado: el usuario puede seleccionar el texto
    }
  }, [brief])

  return (
    <div className="border border-sky-900/50 bg-sky-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-sky-300">
          <Sparkles size={12} /> Brief IA del lead
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 border border-sky-700 bg-sky-950/60 px-2.5 py-1 text-[10px] font-mono text-sky-300 transition hover:bg-sky-900/60 disabled:opacity-50"
          >
            <RefreshCw size={11} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Generando…' : brief ? 'Regenerar' : 'Generar brief'}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] font-mono text-red-400" role="alert">
          {error}
        </p>
      )}

      {!brief && loaded && !error && (
        <p className="mt-2 text-[11px] text-zinc-500">
          {canEdit
            ? 'Sin brief todavía — genera el resumen IA con las señales del lead (actividades, conversaciones, cobros).'
            : 'Sin brief generado para este lead todavía.'}
        </p>
      )}

      {brief && (
        <div className="mt-2 flex flex-col gap-2">
          {brief.sentiment && (
            <span className={`w-fit border px-2 py-0.5 text-[10px] font-mono uppercase ${SENTIMENT_CLS[brief.sentiment] ?? SENTIMENT_CLS.neutral}`}>
              Sentimiento: {brief.sentiment}
            </span>
          )}
          {brief.summary && <p className="text-xs text-zinc-200">{brief.summary}</p>}
          {brief.senales && (
            <ul className="flex flex-col gap-1">
              {brief.senales
                .split('\n')
                .filter(Boolean)
                .map((senal, i) => (
                  <li key={i} className="text-[11px] text-zinc-400">
                    • {senal}
                  </li>
                ))}
            </ul>
          )}
          {brief.proximaAccion && (
            <p className="text-[11px] font-mono text-amber-300">→ {brief.proximaAccion}</p>
          )}
          {brief.mensajeWhatsapp && (
            <div className="border border-zinc-800 bg-zinc-950 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Mensaje WhatsApp sugerido</span>
                <button
                  type="button"
                  onClick={() => void copyMessage()}
                  className="inline-flex items-center gap-1 text-[10px] font-mono text-sky-400 hover:text-sky-300"
                >
                  <Copy size={10} /> {copied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-200">{brief.mensajeWhatsapp}</p>
            </div>
          )}
          <p className="text-[9px] font-mono text-zinc-600">
            {brief.model ? `${brief.model} · ` : ''}
            {brief.updatedAt ? new Intl.DateTimeFormat('es-VE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Caracas' }).format(new Date(brief.updatedAt)) : ''}
          </p>
        </div>
      )}
    </div>
  )
}
