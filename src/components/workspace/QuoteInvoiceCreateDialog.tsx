'use client'

import { useRef } from 'react'
import { FileText, Plus, Receipt, X } from 'lucide-react'

import { createInvoiceAction, createQuoteAction } from '@/lib/billing-actions'
import type { Client, Offer } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

const ITEM_ROWS = 4

/**
 * Crea cotizaciones/facturas sin salir del workspace — reemplaza los links
 * a `/admin/collections/{quotes,invoices}/create`. `payload-invoicepdf`
 * sigue generando el PDF y el número correlativo en su propio hook, sea
 * que el documento se cree desde aquí o desde el admin.
 *
 * Los conceptos usan un número fijo de filas (`ITEM_ROWS`) en vez de un
 * repetidor dinámico con estado de cliente — para el volumen de una pyme
 * (1-2 personas) alcanza sobradamente, y evita duplicar la lógica de un
 * array editor solo para este formulario.
 */
export function QuoteInvoiceCreateDialog({
  kind,
  clients,
  offers,
}: {
  kind: 'quote' | 'invoice'
  clients: Client[]
  offers: Offer[]
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isQuote = kind === 'quote'

  return (
    <>
      <button
        type="button"
        className={
          isQuote
            ? 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono'
            : 'px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono'
        }
        onClick={() => dialogRef.current?.showModal()}
      >
        {isQuote ? <FileText size={16} /> : <Receipt size={16} />}
        {isQuote ? 'Crear cotización' : 'Nueva factura'}
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(38rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            {isQuote ? 'Nueva cotización' : 'Nueva factura'}
          </h2>
          <button type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()} className="text-zinc-400 hover:text-white">
            <X size={16} />
          </button>
        </header>

        <form action={isQuote ? createQuoteAction : createInvoiceAction} className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Cliente (opcional si escribes el nombre abajo)
              <select name="customer" defaultValue="" className={inputCls}>
                <option value="">Cliente nuevo / sin registrar</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {isQuote ? 'Válida hasta' : 'Vencimiento'}
              <input name={isQuote ? 'validUntil' : 'dueDate'} type="date" className={inputCls} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Nombre del cliente (si es nuevo)
              <input name="clientName" maxLength={160} className={inputCls} />
            </label>
            <label className={labelCls}>
              Email del cliente (si es nuevo)
              <input name="clientEmail" type="email" maxLength={240} className={inputCls} />
            </label>
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <p className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-400">Conceptos</p>
            <div className="flex flex-col gap-3">
              {Array.from({ length: ITEM_ROWS }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5 oled-subcard p-2.5">
                  <input
                    name={`item${i}_description`}
                    placeholder={i === 0 ? 'Descripción (obligatorio)' : `Concepto ${i + 1} (opcional)`}
                    required={i === 0}
                    maxLength={240}
                    className={inputCls}
                  />
                  <div className="grid grid-cols-[1.4fr_5rem_5rem_4.5rem] gap-1.5">
                    <select name={`item${i}_product`} defaultValue="" className={`${inputCls} px-2 py-1.5 text-xs`}>
                      <option value="">Concepto libre…</option>
                      {offers.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <input name={`item${i}_quantity`} type="number" min={1} defaultValue={i === 0 ? 1 : ''} placeholder="Cant." className={`${inputCls} px-2 py-1.5 text-xs`} />
                    <input name={`item${i}_unitPrice`} type="number" min={0} step={0.01} placeholder="Precio" className={`${inputCls} px-2 py-1.5 text-xs`} />
                    <input name={`item${i}_taxRate`} type="number" min={0} max={100} placeholder="IVA %" className={`${inputCls} px-2 py-1.5 text-xs`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className={labelCls}>
            Notas
            <textarea name="notes" rows={2} maxLength={2000} className={inputCls} />
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
              <Plus size={14} /> Guardar {isQuote ? 'cotización' : 'factura'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
