'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pin, PinOff, Trash2 } from 'lucide-react'

import { deleteNoteAction, toggleNotePinAction } from '@/lib/notes-actions'

interface NoteCardActionsProps {
  noteId: number
  pinned: boolean
  /** false (viewer): sin pin ni editar — los viewers solo leen (revisión Devin PR #75). */
  canEdit: boolean
  isAdmin: boolean
  adminHref: string
}

/** Acciones de una tarjeta de nota: fijar, editar (→ /admin) y eliminar (admin). */
export function NoteCardActions({ noteId, pinned, canEdit, isAdmin, adminHref }: NoteCardActionsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        setError(res.error ?? 'Error')
        return
      }
      router.refresh()
    })
  }

  const btnCls = 'border border-zinc-800 bg-black p-1.5 text-zinc-400 transition hover:text-white hover:border-zinc-600 disabled:opacity-40'

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {canEdit && (
          <button
            type="button"
            title={pinned ? 'Quitar fijado' : 'Fijar al tope'}
            disabled={pending}
            className={btnCls}
            onClick={() => run(() => toggleNotePinAction({ noteId }))}
          >
            {pinned ? <PinOff className="w-3.5 h-3.5 text-sky-400" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            title="Eliminar nota (solo admin)"
            disabled={pending}
            className={`${btnCls} hover:text-rose-300 hover:border-rose-800`}
            onClick={() => {
              if (!window.confirm('¿Eliminar esta nota? Esta acción no se puede deshacer.')) return
              run(() => deleteNoteAction({ noteId }))
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {canEdit && (
          <a
            href={adminHref}
            title="Editar con el editor completo"
            className="border border-zinc-800 bg-black px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 transition hover:text-white hover:border-zinc-600"
          >
            Editar
          </a>
        )}
      </div>
      {error && <span className="text-[10px] font-mono text-rose-400">{error}</span>}
    </div>
  )
}
