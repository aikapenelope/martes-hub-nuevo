'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageCircle, ExternalLink, CalendarClock } from 'lucide-react'

import type { FollowUpItem } from '@/lib/followups-today'
import type { User } from '@/payload-types'
import { markLeadsContactedTodayAction, snoozeLeadsAction } from '@/lib/hoy-triage-actions'
import { Drawer } from '@/components/workspace/overlays'
import { CrmLeadDrawer } from '@/components/workspace/CrmLeadDrawer'

/**
 * Triage estilo Linear de la cola de seguimientos (ítem 3): j/k navegan,
 * x selecciona, E marca contactado (saca al lead de la cola), S pospone
 * 1/3/7 días, Enter abre la ficha en drawer in-page. Solo los leads tienen
 * acciones de triage; los clientes se muestran con su acceso directo.
 */

const SNOOZE_OPTIONS = [1, 3, 7] as const

const PIPELINE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
}

export function FollowupsTriage({
  items,
  canEdit,
  assignees = [],
}: {
  items: FollowUpItem[]
  canEdit: boolean
  assignees?: User[]
}) {
  const router = useRouter()
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const rowRefs = useRef<Map<number, HTMLLIElement>>(new Map())

  const rows = useMemo(() => items.filter((item) => !hidden.has(`${item.kind}:${item.id}`)), [items, hidden])
  const clampedCursor = Math.min(cursor, Math.max(rows.length - 1, 0))

  const hideKeys = useCallback((keys: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev)
      for (const key of keys) next.add(key)
      return next
    })
    setSelected((prev) => {
      const next = new Set(prev)
      for (const key of keys) next.delete(key)
      return next
    })
  }, [])

  const runAction = useCallback(
    (
      action: (ids: number[]) => Promise<{ ok: boolean; updated?: number; updatedIds?: number[]; failedIds?: number[]; error?: string }>,
      keys: string[],
      done: string,
    ) => {
      startTransition(async () => {
        const leadKeys = keys.filter((k) => k.startsWith('lead:'))
        const targetIds = leadKeys.map((k) => Number(k.slice('lead:'.length)))
        if (targetIds.length === 0) {
          setFeedback('Seleccioná al menos un lead (los clientes no tienen triage)')
          return
        }
        const res = await action(targetIds)
        // Solo se ocultan los leads CONFIRMADOS (hallazgo Devin #105-1/#105-3):
        // los que fallaron siguen visibles y los clientes seleccionados
        // permanecen en la cola — el triage no los toca.
        const confirmed = res.updatedIds ?? []
        if (confirmed.length > 0) hideKeys(confirmed.map((id) => `lead:${id}`))
        if (res.failedIds && res.failedIds.length > 0) {
          setFeedback(
            confirmed.length > 0
              ? `${done.replace('{n}', String(confirmed.length))} · ${res.failedIds.length} fallaron`
              : (res.error ?? `No se pudo aplicar a ${res.failedIds.length} lead(s)`),
          )
        } else if (res.ok) {
          setFeedback(done.replace('{n}', String(confirmed.length)))
        } else {
          setFeedback(res.error ?? 'No se pudo aplicar la acción')
        }
        router.refresh()
      })
    },
    [hideKeys, router],
  )

  // Atajos de teclado (se ignoran mientras el drawer está abierto o se
  // escribe en un input).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (drawerLeadId !== null) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const cursorItem = rows[clampedCursor]
      switch (event.key) {
        case 'j':
          event.preventDefault()
          setCursor((c) => Math.min(c + 1, rows.length - 1))
          break
        case 'k':
          event.preventDefault()
          setCursor((c) => Math.max(c - 1, 0))
          break
        case 'x':
          if (!cursorItem || !canEdit) return
          event.preventDefault()
          setSelected((prev) => {
            const next = new Set(prev)
            const key = `${cursorItem.kind}:${cursorItem.id}`
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
          break
        case 'e':
        case 'E': {
          // Guard de pending (hallazgo Devin #105-4): un E repetido mientras
          // vuela la acción duplicaba actividades de contacto en el timeline.
          if (!canEdit || snoozeOpen || pending) return
          event.preventDefault()
          const keys = selected.size > 0 ? [...selected] : cursorItem ? [`${cursorItem.kind}:${cursorItem.id}`] : []
          const leadKeys = keys.filter((k) => k.startsWith('lead:'))
          if (leadKeys.length === 0) {
            setFeedback('Seleccioná al menos un lead (los clientes no tienen triage)')
            return
          }
          runAction(markLeadsContactedTodayAction, leadKeys, '{n} lead(s) marcados como contactados')
          break
        }
        case 's':
        case 'S':
          if (!canEdit) return
          event.preventDefault()
          setSnoozeOpen((open) => !open)
          break
        case '1':
        case '3':
        case '7': {
          if (!canEdit || !snoozeOpen || pending) return
          event.preventDefault()
          const keys = selected.size > 0 ? [...selected] : cursorItem ? [`${cursorItem.kind}:${cursorItem.id}`] : []
          setSnoozeOpen(false)
          runAction((ids) => snoozeLeadsAction(ids, Number(event.key)), keys, '{n} lead(s) pospuestos')
          break
        }
        case 'Enter': {
          if (snoozeOpen) return
          if (!cursorItem || cursorItem.kind !== 'lead') return
          event.preventDefault()
          setDrawerLeadId(cursorItem.id)
          break
        }
        case 'Escape':
          if (snoozeOpen) {
            setSnoozeOpen(false)
            return
          }
          setSelected(new Set())
          setFeedback(null)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rows, clampedCursor, selected, canEdit, drawerLeadId, snoozeOpen, pending, runAction])

  // El cursor siempre apunta a una fila visible.
  useEffect(() => {
    rowRefs.current.get(clampedCursor)?.scrollIntoView({ block: 'nearest' })
  }, [clampedCursor])

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500">
        <Check className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
        <p className="text-sm font-medium text-white">Al día con todos los contactos</p>
        <p className="mt-1 text-xs font-mono text-zinc-500">
          Ningún lead o cliente ha sobrepasado su SLA de seguimiento sin respuesta.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {canEdit && (
        <p className="mb-3 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          j/k navega · x selecciona · E contactado · S posponer (1/3/7) · Enter ficha · Esc limpia
        </p>
      )}

      {feedback && (
        <div className="mb-3 border border-sky-900/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-300" role="status">
          {feedback}
        </div>
      )}
      {selected.size > 0 && canEdit && (
        <div className="mb-3 flex items-center justify-between border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300">
          <span className="font-mono">{selected.size} seleccionado(s)</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const keys = [...selected]
                runAction(markLeadsContactedTodayAction, keys, '{n} lead(s) marcados como contactados')
              }}
              className="border border-emerald-700 bg-emerald-900/40 px-2 py-1 font-mono text-[10px] uppercase text-emerald-200 transition hover:bg-emerald-900/70 disabled:opacity-50"
            >
              <Check className="mr-1 inline h-3 w-3" /> Contactado (E)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSnoozeOpen(true)}
              className="border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] uppercase text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              <CalendarClock className="mr-1 inline h-3 w-3" /> Posponer (S)
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((item, index) => {
          const key = `${item.kind}:${item.id}`
          const isCursor = index === clampedCursor
          const isSelected = selected.has(key)
          const isLead = item.kind === 'lead'
          return (
            <li
              key={key}
              ref={(el) => {
                if (el) rowRefs.current.set(index, el)
                else rowRefs.current.delete(index)
              }}
              className={`flex flex-col gap-2.5 border p-3 transition sm:flex-row sm:items-center sm:justify-between ${
                isCursor ? 'border-white/60 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'
              } ${isSelected ? 'ring-1 ring-emerald-500/70' : ''}`}
              onClick={() => setCursor(index)}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                {canEdit && isLead && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Seleccionar ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setCursor(index)
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return next
                      })
                    }}
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950 text-emerald-300'
                        : 'border-zinc-700 bg-black text-transparent hover:border-emerald-600 hover:text-emerald-300'
                    }`}
                  >
                    <Check size={11} className="mx-auto" />
                  </button>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`border px-1.5 py-0.5 font-mono text-[10px] ${
                        isLead
                          ? 'border-amber-800 bg-amber-900/50 text-amber-300'
                          : 'border-emerald-800 bg-emerald-900/50 text-emerald-400'
                      }`}
                    >
                      {isLead ? 'Lead' : 'Cliente'}
                    </span>
                    <strong className="text-sm text-white">{item.name}</strong>
                    <span className="font-mono text-[10px] text-zinc-500">
                      · {PIPELINE_LABELS[item.pipeline] ?? item.pipeline}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-300">{item.reason}</p>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[11px] text-zinc-500">
                    <span>Sin contacto hace {item.daysSince} días</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        // Hallazgo Devin #105-2: los clientes navegan a su
                        // ficha CRM (el drawer in-page es solo de leads).
                        if (isLead) setDrawerLeadId(item.id)
                        else router.push(item.crmUrl)
                      }}
                      className="underline hover:text-white"
                    >
                      Ficha
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                <a
                  href={item.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#25d366] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-black shadow-sm transition hover:bg-[#20b858] font-mono"
                >
                  <MessageCircle className="h-3.5 w-3.5 fill-black" />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isLead) setDrawerLeadId(item.id)
                    else router.push(item.crmUrl)
                  }}
                  title={isLead ? 'Abrir ficha sin salir de Hoy' : 'Abrir ficha en el CRM'}
                  className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-2.5 py-2 font-mono text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {snoozeOpen && canEdit && (
        <div className="absolute right-0 top-16 z-20 border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            Posponer leads (1/3/7)
          </p>
          <div className="flex gap-2">
            {SNOOZE_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                disabled={pending}
                onClick={() => {
                  setSnoozeOpen(false)
                  const keys = selected.size > 0 ? [...selected] : rows[clampedCursor] ? [`${rows[clampedCursor]!.kind}:${rows[clampedCursor]!.id}`] : []
                  runAction((ids) => snoozeLeadsAction(ids, days), keys, '{n} lead(s) pospuestos')
                }}
                className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      )}

      <Drawer
        open={drawerLeadId !== null}
        onClose={() => setDrawerLeadId(null)}
        title="Ficha del lead"
        size="2xl"
      >
        {drawerLeadId !== null && (
          <CrmLeadDrawer
            leadId={drawerLeadId}
            canEdit={canEdit}
            assignees={assignees}
            onUpdated={() => router.refresh()}
          />
        )}
      </Drawer>
    </div>
  )
}
