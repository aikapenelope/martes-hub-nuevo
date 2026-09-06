'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

import { createSegmentAction } from '@/lib/segment-actions'
import { Drawer } from '@/components/workspace/overlays'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza el link a `/admin/collections/segments/create` (que ni siquiera existía en el workspace). */
export function SegmentCreateDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> + Rubro
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Nuevo Rubro / Segmento" size="sm">

        <form action={createSegmentAction} className="flex flex-col gap-3">
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
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
              Guardar
            </button>
          </div>
        </form>
      </Drawer>
    </>
  )
}
