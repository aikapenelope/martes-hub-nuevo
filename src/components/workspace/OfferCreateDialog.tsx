'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { createOfferAction } from '@/lib/offer-actions'

const inputCls =
  'w-full border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-muted-foreground/40'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground'

/** Alta de oferta en el catálogo comercial del tenant. */
export function OfferCreateDialog({ segments }: { segments: Array<{ id: number; name: string }> }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-sky-400 px-4 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300"
      >
        <Plus className="h-4 w-4" /> + Oferta
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
              Nueva oferta
            </SheetTitle>
            <SheetDescription className="sr-only">
              Crea una oferta para el catálogo comercial del tenant.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            <form action={createOfferAction} className="flex flex-col gap-3">
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
              <Button
                type="submit"
                className="mt-1 bg-primary px-4 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
              >
                Crear oferta
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
