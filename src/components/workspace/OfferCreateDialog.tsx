'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createOfferAction } from '@/lib/offer-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Alta de oferta en el catálogo comercial del tenant. */
export function OfferCreateDialog({ segments }: { segments: Array<{ id: number; name: string }> }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 bg-sky-400 px-4 py-2 text-xs font-black uppercase shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300 font-mono text-black"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus className="h-4 w-4" /> + Oferta
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(28rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nueva oferta</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={createOfferAction} className="flex flex-col gap-3 p-4">
          <label className={labelCls}>
            Nombre
            <input name="name" required maxLength={160} placeholder="Ej: Gestión de Redes — Plan Pro" className={inputCls} />
          </label>
          <label className={labelCls}>
            Precio base (USD, sin IVA)
            <input name="price" type="number" min="0.01" step="0.01" required placeholder="Ej: 150" className={inputCls} />
          </label>
          <label className={labelCls}>
            Rubro / Segmento (opcional)
            <select name="segment" defaultValue="" className={inputCls}>
              <option value="">— Cualquiera —</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Descripción (opcional)
            <textarea name="description" maxLength={2000} rows={3} placeholder="Qué incluye la oferta…" className={inputCls} />
          </label>
          <button
            type="submit"
            className="mt-1 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider font-mono text-black hover:bg-zinc-200"
          >
            Crear oferta
          </button>
        </form>
      </dialog>
    </>
  )
}
