'use client'

import { useRef } from 'react'
import { Plus, Radio, X } from 'lucide-react'

import { createSocialAccountAction } from '@/lib/social-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/**
 * Reemplaza el link a `/admin/collections/social-accounts/create`. Solo se
 * renderiza para admins (`SocialAccounts.access.create: adminOnly`) — el
 * caller decide si mostrar el botón según `context.isAdmin`.
 */
export function SocialAccountCreateDialog({ variant = 'button' }: { variant?: 'button' | 'cta' }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          aria-label="Conectar cuenta"
          className="px-2 py-1 bg-zinc-900 border border-zinc-700 text-white"
          onClick={() => dialogRef.current?.showModal()}
        >
          <Plus size={14} />
        </button>
      ) : (
        <button
          type="button"
          className="mt-2 px-3 py-1.5 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono"
          onClick={() => dialogRef.current?.showModal()}
        >
          Conectar cuenta
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(26rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white inline-flex items-center gap-2">
            <Radio size={16} /> Conectar cuenta social
          </h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={createSocialAccountAction} className="flex flex-col gap-3 p-4">
          <p className="text-[11px] text-zinc-500">
            Referencia de la cuenta (nombre e ID) — sin credenciales. La conexión real de publicación
            se gestiona en Metricool o Composio, conectados por MCP a este sistema.
          </p>
          <label className={labelCls}>
            Nombre de la cuenta / página
            <input name="accountName" required maxLength={160} className={inputCls} />
          </label>
          <label className={labelCls}>
            Plataforma
            <select name="platform" defaultValue="instagram" className={inputCls}>
              <option value="instagram">Instagram Business</option>
              <option value="facebook">Facebook Page</option>
            </select>
          </label>
          <label className={labelCls}>
            ID de la cuenta en la plataforma
            <input name="platformAccountId" required maxLength={160} className={inputCls} placeholder="Page ID, IG Business Account ID, o el de Metricool" />
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
              Conectar
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
