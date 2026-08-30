'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createMessageTemplateAction } from '@/lib/message-template-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/**
 * Registro manual de una plantilla de WhatsApp que ya está aprobada en
 * Meta — el sync diario la traería de todas formas, esto es para no
 * esperar. `metaStatus` no se pide: solo el sync lo actualiza.
 */
export function MessageTemplateCreateDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus className="w-4 h-4" /> + Plantilla
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(28rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Registrar plantilla</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={createMessageTemplateAction} className="flex flex-col gap-3 p-4">
          <p className="text-[11px] text-zinc-500">
            Debe existir ya aprobada en Meta. El sync diario (12:30) la sincroniza automáticamente;
            esto es solo para registrarla antes de esperar al sync.
          </p>
          <label className={labelCls}>
            Nombre (Meta)
            <input name="name" required maxLength={160} placeholder="Ej: recordatorio_pago" className={inputCls} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Idioma (código Meta)
              <input name="language" required defaultValue="es" maxLength={10} className={inputCls} />
            </label>
            <label className={labelCls}>
              Categoría
              <select name="category" defaultValue="" className={inputCls}>
                <option value="">Sin especificar</option>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidad</option>
                <option value="AUTHENTICATION">Autenticación</option>
              </select>
            </label>
          </div>
          <label className={labelCls}>
            Cuerpo (con placeholders {'{{1}}'}, {'{{2}}'}…)
            <textarea name="bodyText" rows={3} maxLength={2000} className={inputCls} />
          </label>
          <label className={labelCls}>
            ID en OpenBSP (opcional)
            <input name="openbspTemplateId" maxLength={160} className={inputCls} />
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
