'use client'

import { useMemo, useState } from 'react'
import { Calculator, FileText, Plus, Receipt, Sparkles } from 'lucide-react'

import { createInvoiceAction, createQuoteAction } from '@/lib/billing-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Client, Offer } from '@/payload-types'

const labelCls = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

/* Select nativo a tamaño completo: conserva su `<option value="">` del
   contrato (Radix no soporta value="") con los mismos tokens que `Input`. */
const selectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-xs text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/* Campos compactos nativos de las líneas de detalle (input number / select con
   `<option value="">`) con los mismos tokens que `Input`. */
const compactFieldCls =
  'w-full rounded-lg border border-input bg-transparent px-2 py-1.5 font-mono text-xs text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/* Textarea nativa (no hay ui/textarea en el proyecto) con los mismos tokens que `Input`. */
const textareaCls =
  'flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

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
 * Crea cotizaciones y facturas sin salir del workspace mediante un Dialog
 * shadcn de alta fidelidad, con cálculo en tiempo real de subtotales,
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

  const triggerCls = isQuote
    ? 'gap-1.5 border-zinc-700 bg-zinc-900 px-3 font-mono text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200'
    : 'font-mono text-xs font-bold uppercase tracking-wider'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isQuote ? 'outline' : 'default'} className={triggerCls}>
          {isQuote ? <FileText className="size-4" /> : <Receipt className="size-4" />}
          <span>{isQuote ? 'Crear cotización' : 'Nueva factura'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isQuote ? 'Nueva Cotización · Terminal Comercial' : 'Nueva Factura · Terminal Fintech'}
          </DialogTitle>
          <DialogDescription>
            {isQuote
              ? 'Cotizador inteligente con auto-relleno desde el catálogo de ofertas. Moneda base: USD.'
              : 'Emisión de factura fiscal / proforma con desglose de IVA en tiempo real. Moneda base: USD.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 font-mono text-xs">
          {/* Badge del módulo */}
          <div className="flex items-center justify-between border border-border bg-muted/60 p-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 animate-pulse rounded-full ${isQuote ? 'bg-indigo-400' : 'bg-sky-400'}`}
              />
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                {isQuote ? 'Cotizador Inteligente con Catálogo' : 'Emisión de Factura Fiscal / Proforma'}
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">Moneda base: USD</span>
          </div>

          <form action={isQuote ? createQuoteAction : createInvoiceAction} className="flex flex-col gap-4">
            {/* Selección de Cliente y Vigencia */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-customer" className={labelCls}>
                  Cliente del CRM (o libre abajo)
                </Label>
                <select id="doc-customer" name="customer" defaultValue="" className={selectCls}>
                  <option value="">Cliente nuevo / sin registrar…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="doc-due-date" className={labelCls}>
                  {isQuote ? 'Válida hasta' : 'Fecha de Vencimiento'}
                </Label>
                <Input
                  id="doc-due-date"
                  name={isQuote ? 'validUntil' : 'dueDate'}
                  type="date"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Datos para Cliente no registrado */}
            <div className="grid gap-3 border border-border bg-background p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-client-name" className={labelCls}>
                  Nombre del cliente (si es nuevo)
                </Label>
                <Input
                  id="doc-client-name"
                  name="clientName"
                  maxLength={160}
                  placeholder="Empresa o persona destinataria"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-client-email" className={labelCls}>
                  Email del cliente (si es nuevo)
                </Label>
                <Input
                  id="doc-client-email"
                  name="clientEmail"
                  type="email"
                  maxLength={240}
                  placeholder="facturacion@cliente.com"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Conceptos y Líneas de Detalle */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className={labelCls}>Conceptos y Servicios ({ITEM_ROWS} líneas)</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Sparkles className="size-3 text-sky-400" />
                  Auto-relleno con catálogo de ofertas
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {items.map((row, i) => (
                  <div key={i} className="space-y-2 border border-border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        Línea #{i + 1} {i === 0 && <span className="text-rose-400">*</span>}
                      </span>
                      {Number(row.quantity) > 0 && Number(row.unitPrice) > 0 && (
                        <span className="font-mono text-[11px] font-bold text-emerald-400">
                          Subtotal: {usd.format((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0))}
                        </span>
                      )}
                    </div>

                    <Input
                      name={`item${i}_description`}
                      value={row.description}
                      onChange={(e) => handleRowChange(i, 'description', e.target.value)}
                      placeholder={i === 0 ? 'Descripción del concepto (obligatorio)' : `Concepto #${i + 1} (opcional)`}
                      required={i === 0}
                      maxLength={240}
                      className="font-mono text-xs"
                    />

                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1.5fr_5rem_6rem_4.5rem]">
                      <select
                        name={`item${i}_product`}
                        value={row.product}
                        onChange={(e) => handleRowChange(i, 'product', e.target.value)}
                        className={compactFieldCls}
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
                        className={`${compactFieldCls} text-center`}
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
                          className={`${compactFieldCls} text-right`}
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
                        className={`${compactFieldCls} text-center`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tarjeta de Resumen Financiero en Vivo */}
            <div className="space-y-2 border border-border bg-muted/60 p-3.5 font-mono">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                <Calculator className="size-3.5 text-emerald-400" />
                <span>Desglose Financiero Calculado en Tiempo Real</span>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-border pt-1">
                <div>
                  <span className="block text-[10px] uppercase text-muted-foreground">Subtotal</span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {usd.format(calculations.subtotal)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-muted-foreground">IVA Estimado</span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {usd.format(calculations.totalTax)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-[10px] font-bold uppercase text-emerald-400">
                    Total Final
                  </span>
                  <span className="font-mono text-sm font-black text-emerald-300">
                    {usd.format(calculations.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notas y Condiciones */}
            <div className="space-y-1.5">
              <Label htmlFor="doc-notes" className={labelCls}>
                Términos, Condiciones o Notas
              </Label>
              <textarea
                id="doc-notes"
                name="notes"
                rows={2}
                maxLength={2000}
                placeholder="Validez de la oferta, forma de pago acordada, plazos de entrega..."
                className={textareaCls}
              />
            </div>

            {/* Footer con Acciones */}
            <DialogFooter>
              <DialogClose asChild>
                {/* type="button": sin él, Cancelar haría submit del form y crearía el documento (review Devin). */}
                <Button
                  type="button"
                  variant="outline"
                  className="font-mono text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" className="font-mono text-xs font-black uppercase tracking-wider">
                <Plus className="size-3.5" />
                <span>Guardar {isQuote ? 'Cotización' : 'Factura'}</span>
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
