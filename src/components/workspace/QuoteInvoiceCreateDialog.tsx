'use client'

import { useMemo, useState } from 'react'
import { Calculator, FileText, Plus, Receipt, Sparkles } from 'lucide-react'

import { createInvoiceAction, createQuoteAction } from '@/lib/billing-actions'
import { Drawer } from '@/components/workspace/overlays'
import type { Client, Offer } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 font-mono focus:outline-none focus:border-zinc-500 transition'
const labelCls = 'flex flex-col gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-400'

const ITEM_ROWS = 4

interface ItemRowState {
  description: string
  product: string
  quantity: string
  unitPrice: string
  taxRate: string
}

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/**
 * Crea cotizaciones y facturas sin salir del workspace mediante un Drawer
 * lateral de alta fidelidad, con cálculo en tiempo real de subtotales,
 * IVA y total general, y auto-completado desde el catálogo de ofertas.
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
  const [open, setOpen] = useState(false)
  const isQuote = kind === 'quote'

  const [items, setItems] = useState<ItemRowState[]>(() =>
    Array.from({ length: ITEM_ROWS }, (_, i) => ({
      description: '',
      product: '',
      quantity: i === 0 ? '1' : '',
      unitPrice: '',
      taxRate: '',
    })),
  )

  const handleRowChange = (index: number, field: keyof ItemRowState, value: string) => {
    setItems((prev) => {
      const copy = [...prev]
      const current = { ...copy[index], [field]: value }

      // Si selecciona una oferta del catálogo, auto-rellenar precio y descripción si está vacía
      if (field === 'product' && value) {
        const found = offers.find((o) => String(o.id) === value)
        if (found) {
          if (!current.description) {
            current.description = found.name
          }
          if (found.price !== undefined && (!current.unitPrice || current.unitPrice === '0')) {
            current.unitPrice = String(found.price)
          }
          if (!current.quantity) {
            current.quantity = '1'
          }
        }
      }

      copy[index] = current
      return copy
    })
  }

  // Cálculos reactivos en tiempo real
  const calculations = useMemo(() => {
    let subtotal = 0
    let totalTax = 0

    items.forEach((it) => {
      const q = Number(it.quantity) || 0
      const p = Number(it.unitPrice) || 0
      const t = Number(it.taxRate) || 0
      const lineBase = q * p
      const lineTax = lineBase * (t / 100)

      subtotal += lineBase
      totalTax += lineTax
    })

    return {
      subtotal,
      totalTax,
      total: subtotal + totalTax,
    }
  }, [items])

  return (
    <>
      <button
        type="button"
        className={
          isQuote
            ? 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono'
            : 'px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono'
        }
        onClick={() => setOpen(true)}
      >
        {isQuote ? <FileText size={16} /> : <Receipt size={16} />}
        {isQuote ? 'Crear cotización' : 'Nueva factura'}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="2xl"
        title={isQuote ? 'Nueva Cotización · Terminal Comercial' : 'Nueva Factura · Terminal Fintech'}
      >
        <div className="space-y-5 font-mono text-xs">
          {/* Badge del módulo */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isQuote ? 'bg-indigo-400' : 'bg-sky-400'} animate-pulse`} />
              <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                {isQuote ? 'Cotizador Inteligente con Catálogo' : 'Emisión de Factura Fiscal / Proforma'}
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Moneda base: USD</span>
          </div>

          <form action={isQuote ? createQuoteAction : createInvoiceAction} className="space-y-4">
            {/* Selección de Cliente y Vigencia */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                <span>Cliente del CRM (o libre abajo)</span>
                <select name="customer" defaultValue="" className={inputCls}>
                  <option value="">Cliente nuevo / sin registrar…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelCls}>
                <span>{isQuote ? 'Válida hasta' : 'Fecha de Vencimiento'}</span>
                <input name={isQuote ? 'validUntil' : 'dueDate'} type="date" className={inputCls} />
              </label>
            </div>

            {/* Datos para Cliente no registrado */}
            <div className="grid gap-3 sm:grid-cols-2 p-3 bg-zinc-950 border border-zinc-850">
              <label className={labelCls}>
                <span>Nombre del cliente (si es nuevo)</span>
                <input
                  name="clientName"
                  maxLength={160}
                  placeholder="Empresa o persona destinataria"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                <span>Email del cliente (si es nuevo)</span>
                <input
                  name="clientEmail"
                  type="email"
                  maxLength={240}
                  placeholder="facturacion@cliente.com"
                  className={inputCls}
                />
              </label>
            </div>

            {/* Conceptos y Líneas de Detalle */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                  Conceptos y Servicios ({ITEM_ROWS} líneas)
                </span>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Sparkles size={11} className="text-sky-400" />
                  Auto-relleno con catálogo de ofertas
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {items.map((row, i) => (
                  <div key={i} className="oled-subcard p-3 space-y-2 border border-zinc-850">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase">
                        Línea #{i + 1} {i === 0 && <span className="text-rose-400">*</span>}
                      </span>
                      {Number(row.quantity) > 0 && Number(row.unitPrice) > 0 && (
                        <span className="text-[11px] font-mono text-emerald-400 font-bold">
                          Subtotal: {usd.format((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0))}
                        </span>
                      )}
                    </div>

                    <input
                      name={`item${i}_description`}
                      value={row.description}
                      onChange={(e) => handleRowChange(i, 'description', e.target.value)}
                      placeholder={i === 0 ? 'Descripción del concepto (obligatorio)' : `Concepto #${i + 1} (opcional)`}
                      required={i === 0}
                      maxLength={240}
                      className={inputCls}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_5rem_6rem_4.5rem] gap-1.5">
                      <select
                        name={`item${i}_product`}
                        value={row.product}
                        onChange={(e) => handleRowChange(i, 'product', e.target.value)}
                        className={`${inputCls} px-2 py-1.5 text-xs`}
                      >
                        <option value="">Catálogo de Ofertas…</option>
                        {offers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} ({usd.format(o.price)})
                          </option>
                        ))}
                      </select>

                      <input
                        name={`item${i}_quantity`}
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => handleRowChange(i, 'quantity', e.target.value)}
                        placeholder="Cant."
                        className={`${inputCls} px-2 py-1.5 text-xs text-center`}
                      />

                      <div className="relative">
                        <input
                          name={`item${i}_unitPrice`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.unitPrice}
                          onChange={(e) => handleRowChange(i, 'unitPrice', e.target.value)}
                          placeholder="Precio USD"
                          className={`${inputCls} px-2 py-1.5 text-xs text-right`}
                        />
                      </div>

                      <input
                        name={`item${i}_taxRate`}
                        type="number"
                        min={0}
                        max={100}
                        value={row.taxRate}
                        onChange={(e) => handleRowChange(i, 'taxRate', e.target.value)}
                        placeholder="IVA %"
                        className={`${inputCls} px-2 py-1.5 text-xs text-center`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tarjeta de Resumen Financiero en Vivo */}
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 space-y-2 font-mono">
              <div className="flex items-center gap-2 text-zinc-400 text-[10px] uppercase font-bold">
                <Calculator size={13} className="text-emerald-400" />
                <span>Desglose Financiero Calculado en Tiempo Real</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800/80">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">Subtotal</span>
                  <span className="text-xs font-bold text-white font-mono">
                    {usd.format(calculations.subtotal)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block">IVA Estimado</span>
                  <span className="text-xs font-bold text-zinc-300 font-mono">
                    {usd.format(calculations.totalTax)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-emerald-400 uppercase block font-bold">Total Final</span>
                  <span className="text-sm font-black text-emerald-300 font-mono">
                    {usd.format(calculations.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notas y Condiciones */}
            <label className={labelCls}>
              <span>Términos, Condiciones o Notas</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={2000}
                placeholder="Validez de la oferta, forma de pago acordada, plazos de entrega..."
                className={inputCls}
              />
            </label>

            {/* Footer con Acciones */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black uppercase tracking-wider font-mono inline-flex items-center gap-1.5 transition"
              >
                <Plus size={14} /> Guardar {isQuote ? 'Cotización' : 'Factura'}
              </button>
            </div>
          </form>
        </div>
      </Drawer>
    </>
  )
}
