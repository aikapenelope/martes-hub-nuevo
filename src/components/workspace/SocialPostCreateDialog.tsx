'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createSocialPostAction } from '@/lib/social-actions'
import type { SocialAccount } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza el link a `/admin/collections/social-posts/create`. */
export function SocialPostCreateDialog({ accounts }: { accounts: SocialAccount[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus size={16} /> Programar post
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(30rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nueva publicación</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        {accounts.length === 0 ? (
          <p className="p-4 text-xs text-zinc-400">
            No hay cuentas sociales conectadas todavía. Conecta una cuenta primero.
          </p>
        ) : (
          <form action={createSocialPostAction} className="flex flex-col gap-3 p-4">
            <label className={labelCls}>
              Cuenta de destino
              <select name="account" required defaultValue="" className={inputCls}>
                <option value="" disabled>Selecciona una cuenta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountName}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Copy / texto del post
              <textarea name="caption" rows={4} required maxLength={2200} className={inputCls} />
            </label>
            <label className={labelCls}>
              Programar para (déjalo vacío para guardar como borrador)
              <input name="scheduledAt" type="datetime-local" className={inputCls} />
            </label>
            <p className="text-[11px] text-zinc-500">
              Esto solo deja el contenido listo. La publicación real la hace el agente MCP
              conectado a Metricool/Composio.
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
                Guardar
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
