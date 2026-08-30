'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createSegmentAction } from '@/lib/segment-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza el link a `/admin/collections/segments/create` (que ni siquiera existía en el workspace). */
export function SegmentCreateDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus className="w-4 h-4" /> + Rubro
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(24rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nuevo rubro</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={createSegmentAction} className="flex flex-col gap-3 p-4">
          <label className={labelCls}>
            Nombre del rubro
            <input name="name" required maxLength={160} placeholder="Ej: Restaurantes, Clínicas, Ferreterías" className={inputCls} />
          </label>
          <label className={labelCls}>
            Descripción (opcional)
            <textarea name="description" rows={3} maxLength={500} className={inputCls} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
              Guardar
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
