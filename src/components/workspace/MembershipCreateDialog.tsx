'use client'

import { useRef } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'

import { createMembershipAction } from '@/lib/membership-actions'
import type { Client } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza el link a `/admin/collections/memberships/create` (que ni siquiera existía en el workspace). */
export function MembershipCreateDialog({ clients }: { clients: Client[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => dialogRef.current?.showModal()}
      >
        <RefreshCw className="w-4 h-4" /> + Membresía
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(28rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nueva membresía</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        {clients.length === 0 ? (
          <p className="p-4 text-xs text-zinc-400">No hay clientes en este tenant todavía. Crea uno primero desde el CRM.</p>
        ) : (
          <form action={createMembershipAction} className="flex flex-col gap-3 p-4">
            <label className={labelCls}>
              Cliente
              <select name="client" required defaultValue="" className={inputCls}>
                <option value="" disabled>Selecciona un cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Plan
              <input name="plan" required maxLength={160} placeholder="Ej: Web básica, CRM + Redes" className={inputCls} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Precio mensual (USD)
                <input name="monthlyPrice" type="number" min={0.01} step={0.01} required className={inputCls} />
              </label>
              <label className={labelCls}>
                Inicio
                <input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
              </label>
            </div>
            <label className={labelCls}>
              Próxima renovación
              <input name="renewalDate" type="date" required className={inputCls} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5">
                <Plus size={14} /> Guardar membresía
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
