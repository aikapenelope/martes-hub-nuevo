'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createEmailCampaignAction } from '@/lib/email-campaign-actions'
import type { Segment } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza el link a `/admin/collections/email-campaigns/create` (que ni siquiera existía en el workspace). */
export function EmailCampaignCreateDialog({ segments }: { segments: Segment[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus className="w-4 h-4" /> + Campaña
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(32rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nueva campaña de email</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={createEmailCampaignAction} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto p-4">
          <label className={labelCls}>
            Nombre interno
            <input name="name" required maxLength={160} placeholder="Ej: Promo julio 2026" className={inputCls} />
          </label>
          <label className={labelCls}>
            Asunto
            <input name="subject" required maxLength={200} className={inputCls} />
          </label>
          <label className={labelCls}>
            Preheader (opcional)
            <input name="preheader" maxLength={200} className={inputCls} />
          </label>
          <label className={labelCls}>
            Audiencia (rubro, opcional)
            <select name="segment" defaultValue="" className={inputCls}>
              <option value="">Todos los leads/clientes con email</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Cuerpo (HTML)
            <textarea name="bodyHtml" rows={8} required maxLength={20000} placeholder="<p>Hola {{nombre}}...</p>" className={`${inputCls} font-mono text-xs`} />
          </label>
          <p className="text-[11px] text-zinc-500">
            El HTML se sanitiza en el servidor (sin scripts/iframes/handlers inline) y se envuelve
            automáticamente con la plantilla base de la marca.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
              Guardar borrador
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
