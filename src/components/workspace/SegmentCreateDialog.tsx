'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { createSegmentAction } from '@/lib/segment-actions'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const inputCls =
  'w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'

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

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setOpen(false)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Nuevo Rubro / Segmento
            </SheetTitle>
            <SheetDescription className="sr-only">
              Formulario para crear un nuevo rubro o segmento
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
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
                  className="px-4 py-2 bg-muted hover:bg-zinc-800 border border-zinc-700 text-foreground text-xs font-bold uppercase tracking-wider font-mono"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
