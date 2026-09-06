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
import { Drawer } from '@/components/workspace/overlays'
import type { Client } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 font-mono focus:outline-none focus:border-zinc-500 transition'
const labelCls = 'flex flex-col gap-1.5 text-xs font-mono uppercase tracking-wider text-zinc-400'

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
 * Crea un cobro sin salir del workspace mediante un Drawer lateral Fintech
 * de alta fidelidad, con conversiones en tiempo real (USD a Bs) y selector visual.
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

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition text-xs font-mono'

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
    <>
      <button 
        type="button" 
        className={btnCls} 
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
      >
        <Receipt className="w-4 h-4" /> + Cobro
      </button>

      <Drawer
        open={open}
        onClose={() => {
          setOpen(false)
          resetForm()
        }}
        size="xl"
        title="Nuevo Cobro · Terminal Fintech"
      >
        <div className="space-y-5 font-mono text-xs">
          {/* Badge de Terminal & Moneda Base */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Cobro Directo · Multi-Moneda
              </span>
            </div>
            <span className="text-[10px] text-zinc-500">Base: Dólares (USD)</span>
          </div>

          {formError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
              <span>{formError}</span>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-rose-400 hover:text-white ml-2"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {clients.length === 0 ? (
            <div className="p-6 border border-zinc-800 bg-black text-center space-y-3">
              <p className="text-zinc-400 text-xs">
                No hay clientes registrados en este tenant.
              </p>
              <p className="text-zinc-500 text-[11px]">
                Crea un cliente primero en el CRM para asociar sus cobros y pagos.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Selector de Cliente */}
              <label className={labelCls}>
                <span>Cliente <span className="text-rose-400">*</span></span>
                <select name="client" required defaultValue="" className={inputCls}>
                  <option value="" disabled>
                    Selecciona un cliente del CRM…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* Monto y Conversión Referencial */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>
                    <span>Monto en USD <span className="text-rose-400">*</span></span>
                    <div className="relative">
                      <DollarSign
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                      />
                      <input
                        name="amount"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={amountVal}
                        onChange={(e) => setAmountVal(e.target.value)}
                        placeholder="0.00"
                        className={`${inputCls} pl-8 text-emerald-400 font-bold`}
                      />
                    </div>
                  </label>
                  <p className="text-[10px] text-zinc-500 mt-1">Monto entero sin centavos</p>
                </div>

                <label className={labelCls}>
                  <span>Fecha de Vencimiento <span className="text-rose-400">*</span></span>
                  <input name="dueDate" type="date" required className={inputCls} />
                </label>
              </div>

              {/* Módulo de Conversión a Bolívares */}
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">
                    Tasa Referencial (Bs./USD)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setUserRateSrc('bcv')
                        setUserCustomRate(bcvRate || defaultRate || '')
                      }}
                      className={`px-2 py-0.5 text-[9px] uppercase border transition ${
                        rateSrc === 'bcv'
                          ? 'bg-emerald-500 text-black font-bold border-emerald-500'
                          : 'border-zinc-800 text-zinc-400 hover:text-white'
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
                      className={`px-2 py-0.5 text-[9px] uppercase border transition ${
                        rateSrc === 'binance'
                          ? 'bg-amber-400 text-black font-bold border-amber-400'
                          : 'border-zinc-800 text-zinc-400 hover:text-white'
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
                      className="bg-black border border-zinc-700 px-2 py-0.5 text-xs text-emerald-400 font-mono w-24 text-right focus:outline-none"
                    />
                  </div>
                </div>

                {bsEquivalent ? (
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                    <span className="text-[11px] text-zinc-400">Equivalente Estimado:</span>
                    <span className="text-sm font-bold text-emerald-300">
                      Bs. {bsEquivalent}
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-500 italic">
                    Introduce un monto para visualizar la conversión en bolívares.
                  </p>
                )}
              </div>

              {/* Concepto del Cobro */}
              <label className={labelCls}>
                <span>Concepto de Facturación</span>
                <input
                  name="concept"
                  maxLength={240}
                  placeholder="Ej: Mensualidad desarrollo web - Julio 2026"
                  className={inputCls}
                />
              </label>

              {/* Selector Visual de Método de Pago */}
              <div className="space-y-2">
                <span className={labelCls}>Método de Pago Sugerido</span>
                <input type="hidden" name="method" value={selectedMethod} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon
                    const isSelected = selectedMethod === pm.id
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedMethod(isSelected ? '' : pm.id)}
                        className={`p-2.5 text-left border transition flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-950/50 border-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                            : 'bg-black border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Icon size={14} className={isSelected ? 'text-emerald-400' : 'text-zinc-500'} />
                          {isSelected && <Check size={12} className="text-emerald-400" />}
                        </div>
                        <div>
                          <p className="font-bold text-xs text-white">{pm.label}</p>
                          <span className="text-[9px] text-zinc-500">{pm.hint}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notas y Auditoría */}
              <label className={labelCls}>
                <span>Notas Internas / Auditoría</span>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  placeholder="Comentarios adicionales, instrucciones o datos bancarios..."
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
                  disabled={isPending}
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black uppercase tracking-wider font-mono inline-flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  <span>{isPending ? 'Guardando…' : 'Guardar Cobro'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </Drawer>
    </>
  )
}
