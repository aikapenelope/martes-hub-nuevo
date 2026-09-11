'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Check, Copy, RefreshCw, Sparkles } from 'lucide-react'

import { generateLeadBriefAction, getLeadBriefAction, type LeadBriefPayload } from '@/lib/lead-brief-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const SENTIMENT_CLS: Record<string, string> = {
  positivo: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
  neutral: 'text-muted-foreground border-border bg-muted/60',
  negativo: 'text-destructive border-destructive/30 bg-destructive/10',
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
    // La tarjeta se monta por lead (key={lead.id} en el caller): el estado
    // arranca vacío por construcción — nunca se muestra el brief del anterior.
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
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles size={13} className="text-primary" /> Brief IA del lead
        </span>
        {canEdit && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={generate}
            disabled={isPending}
            className="h-7 text-[11px] gap-1.5"
          >
            <RefreshCw size={11} className={isPending ? 'animate-spin' : ''} />
            {isPending ? 'Generando…' : brief ? 'Regenerar' : 'Generar brief'}
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      {!brief && loaded && !error && (
        <p className="mt-2 text-xs text-muted-foreground">
          {canEdit
            ? 'Sin brief todavía — genera el resumen IA con las señales del lead (actividades, conversaciones, cobros).'
            : 'Sin brief generado para este lead todavía.'}
        </p>
      )}

      {brief && (
        <div className="mt-3 flex flex-col gap-2.5">
          {brief.sentiment && (
            <Badge
              variant="outline"
              className={`w-fit text-[10px] font-semibold uppercase tracking-wider ${SENTIMENT_CLS[brief.sentiment] ?? SENTIMENT_CLS.neutral}`}
            >
              Sentimiento: {brief.sentiment}
            </Badge>
          )}
          {brief.summary && <p className="text-xs text-foreground/90 leading-relaxed">{brief.summary}</p>}
          {brief.senales && (
            <ul className="flex flex-col gap-1">
              {brief.senales
                .split('\n')
                .filter(Boolean)
                .map((senal, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary select-none">•</span>
                    <span>{senal}</span>
                  </li>
                ))}
            </ul>
          )}
          {brief.proximaAccion && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-500">
              Próxima acción: {brief.proximaAccion}
            </div>
          )}
          {brief.mensajeWhatsapp && (
            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Mensaje WhatsApp sugerido</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void copyMessage()}
                  className="h-6 gap-1 text-[10px] text-primary hover:text-primary"
                >
                  {copied ? (
                    <>
                      <Check size={11} className="text-emerald-500" /> ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> Copiar
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-foreground/90 leading-relaxed select-all">{brief.mensajeWhatsapp}</p>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/70">
            {brief.model ? `${brief.model} · ` : ''}
            {brief.updatedAt
              ? new Intl.DateTimeFormat('es-VE', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Caracas',
                }).format(new Date(brief.updatedAt))
              : ''}
          </p>
        </div>
      )}
    </div>
  )
}
