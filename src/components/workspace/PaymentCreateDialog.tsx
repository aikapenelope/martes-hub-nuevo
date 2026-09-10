'use client'

import { useState, useTransition } from 'react'
import {
  Banknote,
  Check,
  CreditCard,
  DollarSign,
  Landmark,
  Loader2,
  Plus,
  Receipt,
  Smartphone,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'

import { createPaymentAction } from '@/lib/billing-actions'
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
import type { Client } from '@/payload-types'

const labelCls = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

/* Select nativo: conserva su `<option value="" disabled>` del contrato
   (Radix no soporta value="") con los mismos tokens que `Input`. */
const selectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 font-mono text-xs text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

/* Textarea nativa (no hay ui/textarea en el proyecto) con los mismos tokens que `Input`. */
const textareaCls =
  'flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

interface PaymentCreateDialogProps {
  clients: Client[]
  variant?: 'primary' | 'secondary'
  defaultRate?: string
  rateSource?: 'bcv' | 'binance' | 'manual'
  bcvRate?: string
  binanceRate?: string
}

type PaymentMethodType =
  | 'pago_movil'
  | 'transferencia'
  | 'zelle'
  | 'binance'
  | 'efectivo'
  | 'otro'

const PAYMENT_METHODS: Array<{
  id: PaymentMethodType
  label: string
  icon: LucideIcon
  hint: string
}> = [
  { id: 'pago_movil', label: 'Pago Móvil', icon: Smartphone, hint: 'Bs. inmediato' },
  { id: 'transferencia', label: 'Transferencia', icon: Landmark, hint: 'Bancos VE' },
  { id: 'zelle', label: 'Zelle', icon: CreditCard, hint: 'USD bancario' },
  { id: 'binance', label: 'Binance / Cripto', icon: Wallet, hint: 'USDT / P2P' },
  { id: 'efectivo', label: 'Efectivo', icon: Banknote, hint: 'Cash USD/Bs' },
  { id: 'otro', label: 'Otro', icon: Receipt, hint: 'Personalizado' },
]

/**
 * Crea un cobro sin salir del workspace mediante un Dialog shadcn de
 * alta fidelidad, con conversiones en tiempo real (USD a Bs) y selector visual.
 */
export function PaymentCreateDialog({
  clients,
  variant = 'secondary',
  defaultRate,
  rateSource = 'bcv',
  bcvRate,
  binanceRate,
}: PaymentCreateDialogProps) {
  const [open, setOpen] = useState(false)
  const [amountVal, setAmountVal] = useState<string>('')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType | ''>('')
  const [userRateSrc, setUserRateSrc] = useState<'bcv' | 'binance' | 'manual' | null>(null)
  const [userCustomRate, setUserCustomRate] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Derivación reactiva: si el usuario no ha forzado una tasa manual/fuente,
  // se alimenta automáticamente de las tasas en vivo del padre sin congelarse.
  const rateSrc = userRateSrc ?? rateSource
  const defaultRateForSrc =
    rateSrc === 'binance' && binanceRate
      ? binanceRate
      : rateSrc === 'bcv' && bcvRate
        ? bcvRate
        : defaultRate || ''
  const customRate = userCustomRate ?? defaultRateForSrc

  const resetForm = () => {
    setAmountVal('')
    setSelectedMethod('')
    setUserRateSrc(null)
    setUserCustomRate(null)
    setFormError(null)
  }

  const effectiveRate = Number(customRate || defaultRate)
  const numAmount = Number(amountVal)
  const bsEquivalent =
    effectiveRate > 0 && numAmount > 0
      ? (numAmount * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })
      : null

  const triggerCls =
    variant === 'primary'
      ? 'bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300'
      : 'gap-1.5 border-zinc-700 bg-zinc-900 px-3 font-mono text-xs font-bold uppercase text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200'

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await createPaymentAction(formData)
        resetForm()
        setOpen(false)
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Error al crear el cobro')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button className={triggerCls}>
          <Receipt className="size-4" />
          <span>+ Cobro</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo Cobro · Terminal Fintech</DialogTitle>
          <DialogDescription>
            Cobro directo multi-moneda con conversión a bolívares en tiempo real. Base: dólares
            (USD).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 font-mono text-xs">
          {/* Badge de Terminal & Moneda Base */}
          <div className="flex items-center justify-between border border-border bg-muted/60 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Cobro Directo · Multi-Moneda
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">Base: Dólares (USD)</span>
          </div>

          {formError && (
            <div className="flex items-center justify-between border border-rose-800 bg-rose-950/80 p-3 text-xs text-rose-300">
              <span>{formError}</span>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="ml-2 text-rose-400 transition hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {clients.length === 0 ? (
            <div className="space-y-3 border border-border bg-background p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No hay clientes registrados en este tenant.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Crea un cliente primero en el CRM para asociar sus cobros y pagos.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-mono text-xs">
              {/* Selector de Cliente */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-client" className={labelCls}>
                  Cliente <span className="text-rose-400">*</span>
                </Label>
                <select id="payment-client" name="client" required defaultValue="" className={selectCls}>
                  <option value="" disabled>
                    Selecciona un cliente del CRM…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monto y Conversión Referencial */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-amount" className={labelCls}>
                      Monto en USD <span className="text-rose-400">*</span>
                    </Label>
                    <div className="relative">
                      <DollarSign
                        size={14}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        id="payment-amount"
                        name="amount"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={amountVal}
                        onChange={(e) => setAmountVal(e.target.value)}
                        placeholder="0.00"
                        className="pl-8 font-mono text-xs font-bold text-emerald-400"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Monto entero sin centavos</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payment-due-date" className={labelCls}>
                    Fecha de Vencimiento <span className="text-rose-400">*</span>
                  </Label>
                  <Input id="payment-due-date" name="dueDate" type="date" required className="font-mono text-xs" />
                </div>
              </div>

              {/* Módulo de Conversión a Bolívares */}
              <div className="space-y-2 border border-border bg-muted/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Tasa Referencial (Bs./USD)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserRateSrc('bcv')
                        setUserCustomRate(bcvRate || defaultRate || '')
                      }}
                      className={`border px-2 py-0.5 text-[9px] uppercase transition ${
                        rateSrc === 'bcv'
                          ? 'border-emerald-500 bg-emerald-500 font-bold text-black'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      BCV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserRateSrc('binance')
                        setUserCustomRate(binanceRate || defaultRate || '')
                      }}
                      className={`border px-2 py-0.5 text-[9px] uppercase transition ${
                        rateSrc === 'binance'
                          ? 'border-amber-400 bg-amber-400 font-bold text-black'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Binance
                    </button>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={customRate}
                      onChange={(e) => {
                        setUserCustomRate(e.target.value)
                        setUserRateSrc('manual')
                      }}
                      placeholder="Tasa"
                      className="w-24 rounded-lg border border-border bg-background px-2 py-0.5 text-right font-mono text-xs text-emerald-400 transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>

                {bsEquivalent ? (
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-[11px] text-muted-foreground">Equivalente Estimado:</span>
                    <span className="text-sm font-bold text-emerald-300">
                      Bs. {bsEquivalent}
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] italic text-muted-foreground">
                    Introduce un monto para visualizar la conversión en bolívares.
                  </p>
                )}
              </div>

              {/* Concepto del Cobro */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-concept" className={labelCls}>
                  Concepto de Facturación
                </Label>
                <Input
                  id="payment-concept"
                  name="concept"
                  maxLength={240}
                  placeholder="Ej: Mensualidad desarrollo web - Julio 2026"
                  className="font-mono text-xs"
                />
              </div>

              {/* Selector Visual de Método de Pago */}
              <div className="space-y-2">
                <span className={labelCls}>Método de Pago Sugerido</span>
                <input type="hidden" name="method" value={selectedMethod} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon
                    const isSelected = selectedMethod === pm.id
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedMethod(isSelected ? '' : pm.id)}
                        className={`flex flex-col justify-between gap-1.5 border p-2.5 text-left transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-950/50 text-foreground shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                            : 'border-border bg-background text-muted-foreground hover:border-zinc-700 hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon
                            size={14}
                            className={isSelected ? 'text-emerald-400' : 'text-muted-foreground'}
                          />
                          {isSelected && <Check size={12} className="text-emerald-400" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{pm.label}</p>
                          <span className="text-[9px] text-muted-foreground">{pm.hint}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notas y Auditoría */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-notes" className={labelCls}>
                  Notas Internas / Auditoría
                </Label>
                <textarea
                  id="payment-notes"
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Comentarios adicionales, instrucciones o datos bancarios..."
                  className={textareaCls}
                />
              </div>

              {/* Footer con Acciones */}
              <DialogFooter>
                <DialogClose asChild>
                  {/* type="button": sin él, Cancelar haría submit del form y crearía el cobro (review Devin). */}
                  <Button
                    type="button"
                    variant="outline"
                    className="font-mono text-xs font-bold uppercase tracking-wider"
                  >
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="font-mono text-xs font-black uppercase tracking-wider"
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  <span>{isPending ? 'Guardando…' : 'Guardar Cobro'}</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
