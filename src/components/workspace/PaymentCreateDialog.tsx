'use client'

import { useRef } from 'react'
import { Plus, Receipt, X } from 'lucide-react'

import { createPaymentAction } from '@/lib/billing-actions'
import type { Client } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/**
 * Crea un cobro sin salir del workspace — reemplaza el link a
 * `/admin/collections/payments/create`. Mismo patrón de `<dialog>` +
 * Server Action que `CrmFormDialog`.
 */
export function PaymentCreateDialog({ clients, variant = 'secondary' }: { clients: Client[]; variant?: 'primary' | 'secondary' }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition'

  return (
    <>
      <button type="button" className={`${btnCls} text-xs font-mono`} onClick={() => dialogRef.current?.showModal()}>
        <Receipt className="w-4 h-4" /> + Cobro
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(28rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Nuevo cobro</h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        {clients.length === 0 ? (
          <p className="p-4 text-xs text-zinc-400">
            No hay clientes en este tenant todavía. Crea uno primero desde el CRM.
          </p>
        ) : (
          <form action={createPaymentAction} className="flex flex-col gap-3 p-4">
            <label className={labelCls}>
              Cliente
              <select name="client" required defaultValue="" className={inputCls}>
                <option value="" disabled>Selecciona un cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Monto (USD)
                <input name="amount" type="number" min={0.01} step={0.01} required className={inputCls} />
              </label>
              <label className={labelCls}>
                Vencimiento
                <input name="dueDate" type="date" required className={inputCls} />
              </label>
            </div>
            <label className={labelCls}>
              Concepto
              <input name="concept" maxLength={240} placeholder="Ej: Mensualidad web julio" className={inputCls} />
            </label>
            <label className={labelCls}>
              Método de pago
              <select name="method" defaultValue="" className={inputCls}>
                <option value="">Sin especificar</option>
                <option value="pago_movil">Pago Móvil</option>
                <option value="transferencia">Transferencia</option>
                <option value="zelle">Zelle</option>
                <option value="binance">Binance</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className={labelCls}>
              Notas
              <textarea name="notes" rows={3} maxLength={2000} className={inputCls} />
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
                <Plus size={14} /> Guardar cobro
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
