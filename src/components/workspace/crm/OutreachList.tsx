'use client'

import { useCallback, useState, useTransition } from 'react'
import { Copy, ExternalLink, MessageSquareText, Send } from 'lucide-react'

import { generateOutreachMessageAction, markLeadContactedAction } from '@/lib/outreach-actions'

export interface OutreachRow {
  id: number
  fullName: string
  phone: string
  nivelInteres: 'frio' | 'templado' | 'caliente' | null
  prioridad: 'baja' | 'media' | 'alta' | null
  servicioInteres: string | null
  numeroDeLlamadas: number
  crmUrl: string
  prewritten: string | null
}

const NIVEL_CLS: Record<string, string> = {
  frio: 'text-sky-400 border-sky-800 bg-sky-950/60',
  templado: 'text-amber-300 border-amber-800 bg-amber-950/60',
  caliente: 'text-red-400 border-red-800 bg-red-950/60',
}

function waLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function OutreachList({ rows, canEdit }: { rows: OutreachRow[]; canEdit: boolean }) {
  const [messages, setMessages] = useState<Record<number, string>>(
    () => Object.fromEntries(rows.map((r) => [r.id, r.prewritten ?? ''])),
  )
  const [busy, setBusy] = useState<Record<number, string | null>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [contacted, setContacted] = useState<Record<number, boolean>>({})
  const [, startTransition] = useTransition()

  const setRowBusy = useCallback((id: number, label: string | null) => {
    setBusy((prev) => ({ ...prev, [id]: label }))
  }, [])

  const generate = useCallback((row: OutreachRow) => {
    setRowBusy(row.id, 'ia')
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await generateOutreachMessageAction(row.id)
        if (result.ok) setMessages((prev) => ({ ...prev, [row.id]: result.message }))
        else setNotice(result.error)
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Error generando el mensaje')
      } finally {
        setRowBusy(row.id, null)
      }
    })
  }, [setRowBusy])

  const copy = useCallback(async (row: OutreachRow) => {
    const message = messages[row.id]
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setNotice(`Mensaje de ${row.fullName} copiado al portapapeles`)
    } catch {
      setNotice('No se pudo copiar — selecciona el texto manualmente')
    }
  }, [messages])

  const markContacted = useCallback((row: OutreachRow) => {
    setRowBusy(row.id, 'done')
    startTransition(async () => {
      try {
        const result = await markLeadContactedAction(row.id)
        if (result.ok) {
          setContacted((prev) => ({ ...prev, [row.id]: true }))
          setNotice(`${row.fullName} marcado como contactado (${result.numeroDeLlamadas ?? 1} contacto(s))`)
        } else {
          setNotice(result.error)
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Error marcando el contacto')
      } finally {
        setRowBusy(row.id, null)
      }
    })
  }, [setRowBusy])

  if (rows.length === 0) {
    return (
      <div className="border border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
        <MessageSquareText size={20} className="mx-auto mb-2 text-zinc-600" />
        <p className="text-xs text-zinc-500">
          Sin interesados por ahora — marca leads como 🔥 Caliente o con prioridad Alta en el CRM y aparecerán aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <div className="border border-sky-900/60 bg-sky-950/40 px-4 py-2 text-[11px] font-mono text-sky-300" role="status">
          {notice}
        </div>
      )}
      {rows.map((row) => {
        const isDone = contacted[row.id]
        const busyLabel = busy[row.id]
        return (
          <div key={row.id} className={`border border-zinc-800 bg-zinc-950 p-4 ${isDone ? 'opacity-50' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <a href={row.crmUrl} className="text-sm font-bold text-white hover:text-sky-300">
                  {row.fullName}
                </a>
                {row.nivelInteres && (
                  <span className={`border px-2 py-0.5 text-[10px] font-mono uppercase ${NIVEL_CLS[row.nivelInteres] ?? ''}`}>
                    {row.nivelInteres === 'caliente' ? '🔥 ' : row.nivelInteres === 'templado' ? '🌡️ ' : '❄️ '}{row.nivelInteres}
                  </span>
                )}
                {row.prioridad && (
                  <span className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                    {row.prioridad === 'alta' ? '🔥 ' : ''}Prioridad {row.prioridad}
                  </span>
                )}
                {row.servicioInteres && (
                  <span className="text-[10px] font-mono text-zinc-500">{row.servicioInteres}</span>
                )}
                <span className="text-[10px] font-mono text-zinc-600">{row.numeroDeLlamadas} llamada(s)</span>
              </div>
              <a
                href={row.crmUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-white"
              >
                <ExternalLink size={10} /> Ficha
              </a>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={messages[row.id] ?? ''}
                onChange={(e) => setMessages((prev) => ({ ...prev, [row.id]: e.target.value }))}
                rows={3}
                maxLength={1000}
                placeholder={canEdit ? 'Genera el mensaje con IA o escríbelo a mano…' : 'Sin mensaje generado.'}
                disabled={!canEdit}
                className="w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
              />
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => generate(row)}
                    disabled={busyLabel === 'ia'}
                    className="inline-flex items-center gap-1.5 border border-sky-700 bg-sky-950/60 px-2.5 py-1.5 text-[11px] font-mono text-sky-300 transition hover:bg-sky-900/60 disabled:opacity-50"
                  >
                    <MessageSquareText size={11} /> {busyLabel === 'ia' ? 'Generando…' : 'Generar mensaje IA'}
                  </button>
                  <a
                    href={waLink(row.phone, messages[row.id] || undefined)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 border border-emerald-700 bg-emerald-950/60 px-2.5 py-1.5 text-[11px] font-mono text-emerald-300 transition hover:bg-emerald-900/60"
                  >
                    <Send size={11} /> Abrir WhatsApp (+{row.phone.replace(/\D/g, '')})
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(row)}
                    className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 transition hover:text-white"
                  >
                    <Copy size={11} /> Copiar mensaje
                  </button>
                  <button
                    type="button"
                    onClick={() => markContacted(row)}
                    disabled={busyLabel === 'done' || isDone}
                    className="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 transition hover:text-white disabled:opacity-40"
                  >
                    {isDone ? '✓ Contactado' : busyLabel === 'done' ? 'Guardando…' : 'Marcar contactado'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
