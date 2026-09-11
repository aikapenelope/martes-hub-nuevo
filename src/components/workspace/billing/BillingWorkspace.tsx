'use client'

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  type LucideIcon,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  FileCheck,
  FileText,
  Loader2,
  MessageSquare,
  Receipt,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  X,
} from 'lucide-react'

import type { Client, Invoice, Media, Offer, Payment, Quote } from '@/payload-types'
import {
  convertQuoteToInvoiceAction,
  updateInvoiceStatusAction,
  updatePaymentStatusAction,
  updateQuoteStatusAction,
} from '@/lib/billing-actions'
import { getLiveExchangeRatesAction, type LiveExchangeRates } from '@/lib/exchange-rates'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import { QuoteInvoiceCreateDialog } from '@/components/workspace/QuoteInvoiceCreateDialog'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Compara dueDate y hoy como fechas calendario estrictas (YYYY-MM-DD) en la zona horaria
 * del tenant para evitar desplazamientos por horas/mediodía o desfases de UTC.
 */
function getCalendarDayDiff(
  dueDateStr: string | null | undefined,
  timezone = 'America/Caracas',
): number | null {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr)
  if (Number.isNaN(due.getTime())) return null

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dueParts = fmt.format(due).split('-').map(Number)
  const todayParts = fmt.format(new Date()).split('-').map(Number)

  const dueUtc = Date.UTC(dueParts[0], dueParts[1] - 1, dueParts[2])
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2])

  return Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000))
}

type BillingTab = 'todos_cobros' | 'pendientes' | 'pagados' | 'cotizaciones' | 'facturas'

export type BillingCardKey = 'collected' | 'pending' | 'overdue' | 'cancelled'

const CARD_ICONS: Record<BillingCardKey, LucideIcon> = {
  collected: CircleDollarSign,
  pending: Clock3,
  overdue: ShieldAlert,
  cancelled: Ban,
}

const DEFAULT_CARD_ICONS: LucideIcon[] = [CircleDollarSign, Clock3, ShieldAlert, Ban]

export interface BillingCard {
  key?: BillingCardKey
  label: string
  value: string
  note: string
  icon?: LucideIcon
  accent: 'sky' | 'amber' | 'rose' | 'indigo'
}

interface BillingWorkspaceProps {
  canEdit: boolean
  tenantName: string
  /** Zona horaria configurada del tenant (company-settings) para etiquetas de vencimiento */
  timezone?: string
  clients: Client[]
  offers: Offer[]
  quotes: Quote[]
  invoices: Invoice[]
  payments: Payment[]
  cards: BillingCard[]
}

type SelectedDoc =
  | { kind: 'payment'; data: Payment }
  | { kind: 'quote'; data: Quote }
  | { kind: 'invoice'; data: Invoice }

export function BillingWorkspace({
  canEdit,
  tenantName,
  timezone = 'America/Caracas',
  clients,
  offers,
  quotes,
  invoices,
  payments,
  cards,
}: BillingWorkspaceProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<BillingTab>('todos_cobros')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<SelectedDoc | null>(null)

  // Estados de mutación / acciones
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Drawer y acciones Fintech in-situ
  type DrawerPaymentTab = 'detalle' | 'conciliar' | 'whatsapp'
  const [paymentDrawerTab, setPaymentDrawerTab] = useState<DrawerPaymentTab>('detalle')
  const [payMethod, setPayMethod] = useState<
    'pago_movil' | 'transferencia' | 'zelle' | 'binance' | 'efectivo' | 'otro'
  >('transferencia')
  const [payNotes, setPayNotes] = useState('')
  const [payReference, setPayReference] = useState<string>('')

  // Motor de Tasas de Cambio Referencial (Precios en USD base siempre)
  const [rateSource, setRateSource] = useState<'bcv' | 'binance' | 'manual'>('bcv')
  const [exchangeRate, setExchangeRate] = useState<string>('807.38')
  const [liveRates, setLiveRates] = useState<LiveExchangeRates | null>(null)
  // Inicia en true: el effect de monto lanza la primera carga de tasas
  const [isFetchingRates, setIsFetchingRates] = useState<boolean>(true)

  // No marca setIsFetchingRates(true) de forma síncrona: el caller lo hace en su
  // propio handler (permitido) para evitar cascadas de render en el effect de montaje.
  const fetchRates = async (force = false) => {
    try {
      const rates = await getLiveExchangeRatesAction(force)
      setLiveRates(rates)
      if (rateSource === 'bcv') {
        setExchangeRate(String(rates.bcv.rate))
      } else if (rateSource === 'binance') {
        setExchangeRate(String(rates.binance.rate))
      }
    } catch (e) {
      console.warn('Error obteniendo tasas en vivo:', e)
    } finally {
      setIsFetchingRates(false)
    }
  }

  // Carga inicial de tasas: setState solo dentro de callbacks (no síncrono en el effect).
  // En el montaje rateSource siempre es 'bcv', así que se aplica esa tasa directamente.
  useEffect(() => {
    let cancelled = false
    getLiveExchangeRatesAction(false)
      .then((rates) => {
        if (cancelled) return
        setLiveRates(rates)
        setExchangeRate(String(rates.bcv.rate))
      })
      .catch((e) => {
        console.warn('Error obteniendo tasas en vivo:', e)
      })
      .finally(() => {
        if (!cancelled) setIsFetchingRates(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSelectRateSource = (src: 'bcv' | 'binance' | 'manual') => {
    setRateSource(src)
    if (src === 'bcv' && liveRates) {
      setExchangeRate(String(liveRates.bcv.rate))
    } else if (src === 'binance' && liveRates) {
      setExchangeRate(String(liveRates.binance.rate))
    }
  }

  // Estado para recordatorio de cobro por WhatsApp
  const [copiedReminder, setCopiedReminder] = useState(false)

  function generatePaymentReminderText(payment: Payment): string {
    const cName = getClientName(payment.client)
    const dueDateStr = payment.dueDate ? dateFmt.format(new Date(payment.dueDate)) : 'Pronto'
    const diffDays = getCalendarDayDiff(payment.dueDate, timezone)
    const isOverdue = diffDays !== null && diffDays < 0

    const rateNum = Number(exchangeRate)
    const bsEquivalent =
      rateNum > 0 ? (payment.amount * rateNum).toLocaleString('es-VE', { minimumFractionDigits: 2 }) : null

    return (
      `*Recordatorio de Cobro · ${tenantName}*\n\n` +
      `Hola ${cName}, esperamos que estés muy bien.\n\n` +
      `Te recordamos la gestión de pago pendiente por el siguiente concepto:\n` +
      `• *Concepto:* ${payment.concept || 'Servicios profesionales'}\n` +
      `• *Monto a pagar:* ${usd.format(payment.amount)} USD (Base)\n` +
      (bsEquivalent
        ? `• *Referencia en Bolívares (Pago Móvil / Transferencia):* Bs. ${bsEquivalent} (Tasa: Bs. ${exchangeRate} / USD · ${rateSource.toUpperCase()})\n`
        : '') +
      `• *Fecha de vencimiento:* ${dueDateStr}\n` +
      (isOverdue ? `⚠️ _Registra ${Math.abs(diffDays!)} día(s) de mora._\n` : '') +
      `\nSi ya realizaste la transferencia o Pago Móvil, por favor compártenos el comprobante o número de referencia por este medio para conciliarlo en el sistema.\n\n` +
      `¡Muchas gracias por tu confianza!`
    )
  }

  function pdfUrl(doc: Quote | Invoice): string | null {
    const first = doc.generatedPdfs?.[0]
    if (first && typeof first === 'object') return (first as Media).url ?? null
    return null
  }

  function getClientName(clientField: unknown): string {
    if (!clientField) return 'Cliente sin nombre'
    if (typeof clientField === 'object' && clientField !== null && 'name' in clientField) {
      return (clientField as { name: string }).name
    }
    return String(clientField)
  }

  function getCustomerId(clientField: unknown): number | null {
    if (!clientField) return null
    if (typeof clientField === 'object' && clientField !== null) {
      if ('id' in clientField && typeof (clientField as { id: unknown }).id === 'number') {
        return (clientField as { id: number }).id
      }
      if ('customer' in clientField) {
        const cust = (clientField as { customer?: unknown }).customer
        if (typeof cust === 'number') return cust
        if (typeof cust === 'object' && cust !== null && 'id' in cust) {
          return (cust as { id: number }).id
        }
      }
    }
    return typeof clientField === 'number' ? clientField : null
  }

  // Filtrado de cobros según búsqueda y tab
  const filteredPayments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return payments.filter((p) => {
      // Filtro por tab
      if (activeTab === 'pendientes' && p.status !== 'pendiente' && p.status !== 'vencido') return false
      if (activeTab === 'pagados' && p.status !== 'pagado') return false

      // Búsqueda
      if (!q) return true
      const cName = getClientName(p.client).toLowerCase()
      const concept = (p.concept || '').toLowerCase()
      const notes = (p.notes || '').toLowerCase()
      return cName.includes(q) || concept.includes(q) || notes.includes(q)
    })
  }, [payments, activeTab, searchQuery])

  // Filtrado de cotizaciones
  const filteredQuotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return quotes.filter((quote) => {
      if (!q) return true
      const cName = (quote.client?.name || '').toLowerCase()
      const num = (quote.quoteNumber || '').toLowerCase()
      const notes = (quote.notes || '').toLowerCase()
      return cName.includes(q) || num.includes(q) || notes.includes(q)
    })
  }, [quotes, searchQuery])

  // Filtrado de facturas
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return invoices.filter((inv) => {
      if (!q) return true
      const cName = (inv.client?.name || '').toLowerCase()
      const num = (inv.invoiceNumber || '').toLowerCase()
      const notes = (inv.notes || '').toLowerCase()
      return cName.includes(q) || num.includes(q) || notes.includes(q)
    })
  }, [invoices, searchQuery])

  // Manejador para marcar pago como pagado
  const handleConfirmPayment = () => {
    if (!activeDoc || activeDoc.kind !== 'payment') return
    const payment = activeDoc.data
    if (payment.status === 'anulado') {
      setActionError('Un cobro anulado no puede conciliarse directamente; reactívalo primero')
      return
    }
    setActionError(null)
    setActionSuccess(null)
    startTransition(async () => {
      const usesExchangeRate = payMethod === 'pago_movil' || payMethod === 'transferencia'
      const rateNum = usesExchangeRate ? Number(exchangeRate) : 0
      const bsEquivalent = rateNum > 0 ? (payment.amount * rateNum).toFixed(2) : null
      const noteDetails = [
        payReference ? `Ref: ${payReference}` : null,
        bsEquivalent ? `Tasa ${rateSource.toUpperCase()}: ${exchangeRate} (Bs. ${bsEquivalent})` : null,
        payNotes ? payNotes.trim() : null,
      ]
        .filter(Boolean)
        .join(' | ')

      const finalNotes = payment.notes
        ? `${payment.notes}\n[Conciliación]: ${noteDetails}`
        : noteDetails || undefined

      const res = await updatePaymentStatusAction({
        paymentId: payment.id,
        status: 'pagado',
        method: payMethod,
        notes: finalNotes,
      })
      if (!res.ok) {
        setActionError(res.error || 'No se pudo registrar el pago')
      } else {
        setActionSuccess('Pago registrado y conciliado exitosamente')
        setSelectedDoc({
          kind: 'payment',
          data: {
            ...payment,
            status: 'pagado',
            method: payMethod,
            notes: finalNotes,
          },
        })
        setPaymentDrawerTab('detalle')
        setPayNotes('')
        setPayReference('')
        router.refresh()
      }
    })
  }

  // Manejador para anular pago
  const handleCancelPayment = (paymentId: number) => {
    if (!confirm('¿Estás seguro de anular este cobro?')) return
    setActionError(null)
    setActionSuccess(null)
    startTransition(async () => {
      const res = await updatePaymentStatusAction({
        paymentId,
        status: 'anulado',
      })
      if (!res.ok) {
        setActionError(res.error || 'No se pudo anular el cobro')
      } else {
        setActionSuccess('Cobro anulado')
        setSelectedDoc((prev) =>
          prev && prev.kind === 'payment' && prev.data.id === paymentId
            ? { ...prev, data: { ...prev.data, status: 'anulado' } }
            : prev,
        )
        router.refresh()
      }
    })
  }

  // Manejador para reactivar cobro
  const handleReactivatePayment = (paymentId: number) => {
    setActionError(null)
    setActionSuccess(null)
    startTransition(async () => {
      const res = await updatePaymentStatusAction({
        paymentId,
        status: 'pendiente',
      })
      if (!res.ok) {
        setActionError(res.error || 'No se pudo reactivar el cobro')
      } else {
        setActionSuccess('Cobro reactivado como pendiente')
        setSelectedDoc((prev) =>
          prev && prev.kind === 'payment' && prev.data.id === paymentId
            ? { ...prev, data: { ...prev.data, status: 'pendiente' } }
            : prev,
        )
        router.refresh()
      }
    })
  }

  // Manejador para convertir cotización a factura
  const handleConvertQuote = (quoteId: number) => {
    if (!confirm('¿Convertir esta cotización en factura comercial? Se clonarán los conceptos y se creará el cobro pendiente.')) return
    setActionError(null)
    setActionSuccess(null)
    startTransition(async () => {
      const res = await convertQuoteToInvoiceAction({ quoteId })
      if (!res.ok) {
        setActionError(res.error || 'Error al convertir cotización')
      } else {
        setActionSuccess('Cotización convertida en Factura exitosamente')
        setSelectedDoc((prev) =>
          prev && prev.kind === 'quote' && prev.data.id === quoteId
            ? { ...prev, data: { ...prev.data, status: 'accepted' } }
            : prev,
        )
        router.refresh()
      }
    })
  }

  // Manejador para cambiar estado de cotización
  const handleChangeQuoteStatus = (quoteId: number, status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired') => {
    setActionError(null)
    startTransition(async () => {
      const res = await updateQuoteStatusAction({ quoteId, status })
      if (!res.ok) {
        setActionError(res.error || 'Error al actualizar cotización')
      } else {
        setSelectedDoc((prev) =>
          prev && prev.kind === 'quote' && prev.data.id === quoteId
            ? { ...prev, data: { ...prev.data, status } }
            : prev,
        )
        router.refresh()
      }
    })
  }

  // Manejador para cambiar estado de factura
  const handleChangeInvoiceStatus = (invoiceId: number, status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled') => {
    setActionError(null)
    startTransition(async () => {
      const res = await updateInvoiceStatusAction({ invoiceId, status })
      if (!res.ok) {
        setActionError(res.error || 'Error al actualizar factura')
      } else {
        setSelectedDoc((prev) =>
          prev && prev.kind === 'invoice' && prev.data.id === invoiceId
            ? { ...prev, data: { ...prev.data, status } }
            : prev,
        )
        router.refresh()
      }
    })
  }

  // Documento activo derivado por ID para mantenerse siempre sincronizado con los props de la ruta
  const activeDoc: SelectedDoc | null = (() => {
    if (!selectedDoc) return null
    if (selectedDoc.kind === 'payment') {
      const fresh = payments.find((p) => p.id === selectedDoc.data.id)
      return fresh ? { kind: 'payment', data: fresh } : selectedDoc
    }
    if (selectedDoc.kind === 'quote') {
      const fresh = quotes.find((q) => q.id === selectedDoc.data.id)
      return fresh ? { kind: 'quote', data: fresh } : selectedDoc
    }
    if (selectedDoc.kind === 'invoice') {
      const fresh = invoices.find((inv) => inv.id === selectedDoc.data.id)
      return fresh ? { kind: 'invoice', data: fresh } : selectedDoc
    }
    return selectedDoc
  })()

  return (
    <div className="space-y-5">
      {/* 1. Hero del módulo con Quick Dialogs */}
      <PageHeader
        eyebrow="Ventas y Finanzas Operativas"
        title="Facturación & Cobranzas"
        description={`Gestión comercial, flujo de cobros y emisión de comprobantes de ${tenantName}.`}
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <QuoteInvoiceCreateDialog kind="quote" clients={clients} offers={offers} />
              <QuoteInvoiceCreateDialog kind="invoice" clients={clients} offers={offers} />
              <PaymentCreateDialog
                clients={clients}
                variant="primary"
                defaultRate={exchangeRate}
                rateSource={rateSource}
                bcvRate={liveRates ? String(liveRates.bcv.rate) : exchangeRate}
                binanceRate={liveRates ? String(liveRates.binance.rate) : undefined}
              />
            </div>
          ) : undefined
        }
      />

      {/* 2. Banner de Alertas / Feedback */}
      {actionError && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CircleAlert size={14} className="shrink-0" />
            <span>{actionError}</span>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setActionError(null)} className="text-rose-400 hover:text-foreground">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-foreground">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* 3. Indicadores de Salud Financiera (KPIs) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de cobranza">
        {cards.map((card, idx) => {
          const Icon = card.icon || (card.key ? CARD_ICONS[card.key] : DEFAULT_CARD_ICONS[idx % DEFAULT_CARD_ICONS.length])
          return (
            <KpiCard
              key={card.label}
              label={card.label}
              value={card.value}
              icon={Icon}
              accent={card.accent}
              note={card.note}
            />
          )
        })}
      </section>

      {/* 4. Barra de Navegación por Pestañas & Buscador Reactivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-border/90 py-3 bg-background/40">
        {/* Tabs de vista */}
        <div className="inline-flex flex-wrap items-center bg-background border border-border p-1 gap-1 font-mono text-xs">
          <Button
            type="button"
            onClick={() => setActiveTab('todos_cobros')}
            variant={activeTab === 'todos_cobros' ? 'default' : 'ghost'}
            className={`h-auto px-3 py-1.5 uppercase ${
              activeTab === 'todos_cobros' ? 'font-black shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos los Cobros ({payments.length})
          </Button>

          <Button
            type="button"
            onClick={() => setActiveTab('pendientes')}
            variant={activeTab === 'pendientes' ? 'default' : 'ghost'}
            className={`h-auto px-3 py-1.5 uppercase ${
              activeTab === 'pendientes'
                ? 'bg-amber-500 text-black font-black shadow-sm hover:bg-amber-500 hover:text-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock3 className="size-3" />
            <span>Por Cobrar</span>
            <span className="text-[10px] opacity-80">
              ({payments.filter((p) => p.status === 'pendiente' || p.status === 'vencido').length})
            </span>
          </Button>

          <Button
            type="button"
            onClick={() => setActiveTab('pagados')}
            variant={activeTab === 'pagados' ? 'default' : 'ghost'}
            className={`h-auto px-3 py-1.5 uppercase ${
              activeTab === 'pagados'
                ? 'bg-emerald-400 text-black font-black shadow-sm hover:bg-emerald-400 hover:text-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Check className="size-3" />
            <span>Pagados</span>
            <span className="text-[10px] opacity-80">
              ({payments.filter((p) => p.status === 'pagado').length})
            </span>
          </Button>

          <Button
            type="button"
            onClick={() => setActiveTab('cotizaciones')}
            variant={activeTab === 'cotizaciones' ? 'default' : 'ghost'}
            className={`h-auto px-3 py-1.5 uppercase ${
              activeTab === 'cotizaciones'
                ? 'bg-indigo-600 font-black shadow-sm hover:bg-indigo-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="size-3" />
            <span>Cotizaciones ({quotes.length})</span>
          </Button>

          <Button
            type="button"
            onClick={() => setActiveTab('facturas')}
            variant={activeTab === 'facturas' ? 'default' : 'ghost'}
            className={`h-auto px-3 py-1.5 uppercase ${
              activeTab === 'facturas'
                ? 'bg-sky-400 text-black font-black shadow-sm hover:bg-sky-400 hover:text-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt className="size-3" />
            <span>Facturas ({invoices.length})</span>
          </Button>
        </div>

        {/* Buscador reactivo */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, concepto..."
            className="w-full bg-background border border-border pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:border-muted-foreground/40"
          />
        </div>
      </div>

      {/* Barra de Tasa Cambiaria Referencial (Base siempre USD) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-background border border-border/80 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            <span>Base USD ($)</span>
          </span>
          <span className="text-muted-foreground text-[11px]">
            Precios pactados en dólares. Tasa referencial para cobros en Bolívares:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de fuente */}
          <div className="inline-flex items-center border border-border bg-background p-0.5 text-[10px]">
            <Button
              type="button"
              onClick={() => handleSelectRateSource('bcv')}
              variant={rateSource === 'bcv' ? 'default' : 'ghost'}
              className={`h-auto px-2 py-1 uppercase ${
                rateSource === 'bcv'
                  ? 'bg-emerald-500 text-black font-black hover:bg-emerald-500 hover:text-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              BCV {liveRates ? `(${liveRates.bcv.rate})` : ''}
            </Button>
            <Button
              type="button"
              onClick={() => handleSelectRateSource('binance')}
              variant={rateSource === 'binance' ? 'default' : 'ghost'}
              className={`h-auto px-2 py-1 uppercase ${
                rateSource === 'binance'
                  ? 'bg-amber-400 text-black font-black hover:bg-amber-400 hover:text-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Binance P2P {liveRates ? `(${liveRates.binance.rate})` : ''}
            </Button>
            <Button
              type="button"
              onClick={() => setRateSource('manual')}
              variant={rateSource === 'manual' ? 'default' : 'ghost'}
              className={`h-auto px-2 py-1 uppercase ${
                rateSource === 'manual'
                  ? 'bg-muted text-foreground font-black hover:bg-muted hover:text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Manual
            </Button>
          </div>

          {/* Input de tasa editable en todo momento */}
          <div className="flex items-center gap-1 bg-background border border-border px-2 py-1">
            <span className="text-muted-foreground text-[10px]">Bs./USD</span>
            <input
              type="number"
              step="0.01"
              min="1"
              value={exchangeRate}
              onChange={(e) => {
                setExchangeRate(e.target.value)
                setRateSource('manual')
              }}
              className="w-20 bg-transparent text-emerald-400 font-bold text-xs text-right focus:outline-none"
            />
          </div>

          {/* Botón de refresco */}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              setIsFetchingRates(true)
              void fetchRates(true)
            }}
            disabled={isFetchingRates}
            className="text-muted-foreground hover:text-foreground"
            title="Actualizar tasas en vivo desde API"
          >
            <RotateCcw className={`size-3 ${isFetchingRates ? 'animate-spin text-sky-400' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 5. Vistas de Contenido */}

      {/* 5.A. Tablas de Cobros (Todos / Pendientes / Pagados) */}
      {(activeTab === 'todos_cobros' || activeTab === 'pendientes' || activeTab === 'pagados') && (
        <div className="bg-card text-card-foreground border border-border p-3.5 !p-0 animate-fadeIn">
          {filteredPayments.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              {searchQuery
                ? `No se encontraron cobros coincidentes con «${searchQuery}».`
                : 'No hay registros de cobros para este filtro.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-left text-xs">
                <TableHeader>
                  <TableRow className="border-border bg-background/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <TableHead className="px-4 py-2.5">Cliente</TableHead>
                    <TableHead className="px-4 py-2.5">Concepto</TableHead>
                    <TableHead className="px-4 py-2.5">Monto (USD)</TableHead>
                    <TableHead className="px-4 py-2.5">Estado</TableHead>
                    <TableHead className="px-4 py-2.5">Vencimiento</TableHead>
                    <TableHead className="px-4 py-2.5">Método</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Acciones In-Situ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p) => {
                    const clientName = getClientName(p.client)
                    const isOverdue = p.status === 'vencido'
                    const isPendingState = p.status === 'pendiente'
                    const isPaid = p.status === 'pagado'
                    const isCancelled = p.status === 'anulado'

                    const diffDays = getCalendarDayDiff(p.dueDate, timezone)

                    return (
                      <TableRow
                        key={p.id}
                        onClick={() => {
                          setSelectedDoc({ kind: 'payment', data: p })
                          setPaymentDrawerTab('detalle')
                        }}
                        className="cursor-pointer group"
                      >
                        <TableCell className="px-4 py-3 text-foreground font-medium group-hover:text-sky-300 transition">
                          {clientName}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground truncate max-w-xs">
                          {p.concept || 'Cobro sin concepto'}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground">
                          {usd.format(p.amount)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            variant={
                              isOverdue
                                ? 'destructive'
                                : isPaid
                                  ? 'success'
                                  : isCancelled
                                    ? 'outline'
                                    : 'warning'
                            }
                            className="font-mono text-[10px]"
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-muted-foreground">
                          <div>{p.dueDate ? dateFmt.format(new Date(p.dueDate)) : '—'}</div>
                          {diffDays !== null && (isPendingState || isOverdue) && (
                            <div className="text-[10px] mt-0.5">
                              {diffDays < 0 ? (
                                <span className="text-rose-400 font-bold">Venció hace {Math.abs(diffDays)}d</span>
                              ) : diffDays === 0 ? (
                                <span className="text-amber-400 font-bold">Vence hoy</span>
                              ) : diffDays <= 5 ? (
                                <span className="text-amber-300">En {diffDays}d</span>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-muted-foreground capitalize">
                          {p.method ? p.method.replace('_', ' ') : '—'}
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {(isPendingState || isOverdue) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedDoc({ kind: 'payment', data: p })
                                    setPaymentDrawerTab('whatsapp')
                                  }}
                                  className="h-auto gap-1 px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border-emerald-800/80 font-mono text-[10px]"
                                  title="Enviar recordatorio por WhatsApp"
                                >
                                  <MessageSquare className="size-3" />
                                  <span>WhatsApp</span>
                                </Button>
                              )}

                              {(isPendingState || isOverdue) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedDoc({ kind: 'payment', data: p })
                                    setPaymentDrawerTab('conciliar')
                                    setPayMethod((p.method as typeof payMethod) || 'transferencia')
                                    setPayReference('')
                                    setPayNotes('')
                                  }}
                                  className="h-auto gap-1 px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border-emerald-500/30 font-mono text-[10px] font-bold uppercase"
                                  title="Registrar confirmación de pago"
                                >
                                  <Check className="size-3" />
                                  <span>Registrar Pago</span>
                                </Button>
                              )}

                              {(isPendingState || isOverdue) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleCancelPayment(p.id)}
                                  className="hover:bg-muted/60 text-muted-foreground hover:text-rose-400"
                                  title="Anular cobro"
                                >
                                  <Ban className="size-3.5" />
                                </Button>
                              )}

                              {isCancelled && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleReactivatePayment(p.id)}
                                  className="h-auto gap-1 px-2 py-1 bg-muted hover:bg-muted/60 text-foreground/80 font-mono text-[10px]"
                                  title="Reactivar cobro"
                                >
                                  <RotateCcw className="size-3" />
                                  <span>Reactivar</span>
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-xs font-mono text-muted-foreground">
            <span>
              Mostrando {filteredPayments.length} de {payments.length} cobros
            </span>
            <span className="text-muted-foreground">Haz clic en cualquier fila para ver el detalle 360°</span>
          </footer>
        </div>
      )}

      {/* 5.B. Pestaña: Cotizaciones (Quotes) */}
      {activeTab === 'cotizaciones' && (
        <div className="bg-card text-card-foreground border border-border p-3.5 !p-0 animate-fadeIn">
          {filteredQuotes.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              {searchQuery
                ? `No se encontraron cotizaciones coincidentes con «${searchQuery}».`
                : 'Sin cotizaciones registradas.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-left text-xs">
                <TableHeader>
                  <TableRow className="border-border bg-background/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <TableHead className="px-4 py-2.5">Número</TableHead>
                    <TableHead className="px-4 py-2.5">Cliente</TableHead>
                    <TableHead className="px-4 py-2.5">Total (USD)</TableHead>
                    <TableHead className="px-4 py-2.5">Estado</TableHead>
                    <TableHead className="px-4 py-2.5">Válida hasta</TableHead>
                    <TableHead className="px-4 py-2.5">Comprobante</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Acciones Comerciales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes.map((q) => {
                    const url = pdfUrl(q)
                    const canConvert = q.status === 'draft' || q.status === 'sent'

                    return (
                      <TableRow
                        key={q.id}
                        onClick={() => setSelectedDoc({ kind: 'quote', data: q })}
                        className="cursor-pointer group"
                      >
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground group-hover:text-indigo-400 transition">
                          {q.quoteNumber || `COT-#${q.id}`}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-foreground/80 font-medium">
                          {q.client?.name || 'Cliente sin nombre'}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground">
                          {usd.format(q.total ?? 0)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            variant={
                              q.status === 'accepted'
                                ? 'success'
                                : q.status === 'rejected' || q.status === 'expired'
                                  ? 'destructive'
                                  : 'outline'
                            }
                            className="font-mono text-[10px]"
                          >
                            {q.status || 'draft'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-muted-foreground">
                          {q.validUntil ? dateFmt.format(new Date(q.validUntil)) : '—'}
                        </TableCell>
                        <TableCell
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300 font-mono text-[11px] flex items-center gap-1"
                            >
                              <span>PDF</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="text-muted-foreground font-mono text-[10px]">Sin PDF</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {canConvert && (
                                <Button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleConvertQuote(q.id)}
                                  className="h-auto gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 font-mono text-[10px] uppercase font-bold shadow-sm"
                                  title="Crear Factura y Cobro automático a partir de esta cotización"
                                >
                                  {isPending ? <Loader2 className="size-3 animate-spin" /> : <FileCheck className="size-3" />}
                                  <span>Convertir a Factura</span>
                                </Button>
                              )}

                              {q.status === 'draft' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleChangeQuoteStatus(q.id, 'sent')}
                                  className="h-auto px-2 py-1 bg-muted hover:bg-muted/60 text-foreground/80 font-mono text-[10px]"
                                >
                                  Marcar Enviada
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <footer className="border-t border-border px-4 py-3 text-xs font-mono text-muted-foreground">
            <span>{filteredQuotes.length} cotizaciones registradas</span>
          </footer>
        </div>
      )}

      {/* 5.C. Pestaña: Facturas (Invoices) */}
      {activeTab === 'facturas' && (
        <div className="bg-card text-card-foreground border border-border p-3.5 !p-0 animate-fadeIn">
          {filteredInvoices.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              {searchQuery
                ? `No se encontraron facturas coincidentes con «${searchQuery}».`
                : 'Sin facturas emitidas.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-left text-xs">
                <TableHeader>
                  <TableRow className="border-border bg-background/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <TableHead className="px-4 py-2.5">Factura #</TableHead>
                    <TableHead className="px-4 py-2.5">Cliente</TableHead>
                    <TableHead className="px-4 py-2.5">Total (USD)</TableHead>
                    <TableHead className="px-4 py-2.5">Estado</TableHead>
                    <TableHead className="px-4 py-2.5">Vencimiento</TableHead>
                    <TableHead className="px-4 py-2.5">Comprobante</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => {
                    const url = pdfUrl(inv)
                    return (
                      <TableRow
                        key={inv.id}
                        onClick={() => setSelectedDoc({ kind: 'invoice', data: inv })}
                        className="cursor-pointer group"
                      >
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground group-hover:text-sky-300 transition">
                          {inv.invoiceNumber || `INV-#${inv.id}`}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-foreground/80 font-medium">
                          {inv.client?.name || 'Cliente sin nombre'}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground">
                          {usd.format(inv.total ?? 0)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            variant={
                              inv.status === 'paid'
                                ? 'success'
                                : inv.status === 'overdue' || inv.status === 'cancelled'
                                  ? 'destructive'
                                  : 'outline'
                            }
                            className="font-mono text-[10px]"
                          >
                            {inv.status || 'draft'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-muted-foreground">
                          {inv.dueDate ? dateFmt.format(new Date(inv.dueDate)) : '—'}
                        </TableCell>
                        <TableCell
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300 font-mono text-[11px] flex items-center gap-1"
                            >
                              <span>PDF</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="text-muted-foreground font-mono text-[10px]">Sin PDF</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {inv.status !== 'paid' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleChangeInvoiceStatus(inv.id, 'paid')}
                                  className="h-auto gap-1 px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border-emerald-500/30 font-mono text-[10px] uppercase font-bold"
                                >
                                  <Check className="size-3" />
                                  <span>Pagada</span>
                                </Button>
                              )}
                              {inv.status !== 'cancelled' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleChangeInvoiceStatus(inv.id, 'cancelled')}
                                  className="hover:bg-muted/60 text-muted-foreground hover:text-rose-400"
                                  title="Anular factura"
                                >
                                  <Ban className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <footer className="border-t border-border px-4 py-3 text-xs font-mono text-muted-foreground">
            <span>{filteredInvoices.length} facturas emitidas</span>
          </footer>
        </div>
      )}

      {/* 6. Slide-Over Sheet: Terminal Fintech 360° */}
      <Sheet
        open={activeDoc !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDoc(null)
            setPaymentDrawerTab('detalle')
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
              {activeDoc?.kind === 'payment'
                ? 'Terminal Fintech · Cobro'
                : activeDoc?.kind === 'quote'
                  ? 'Terminal Comercial · Cotización'
                  : 'Terminal Fiscal · Factura'}
            </SheetTitle>
            <SheetDescription className="sr-only">Detalle 360° del documento de facturación</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {activeDoc && (
          <div className="space-y-4 font-mono text-xs">
            {/* === CASO 1: COBRO (PAYMENT) === */}
            {activeDoc.kind === 'payment' && (() => {
              const payment = activeDoc.data
              const clientName = getClientName(payment.client)
              const custId = getCustomerId(payment.client)
              const diffDays = getCalendarDayDiff(payment.dueDate, timezone)
              const isOverdue = payment.status === 'vencido'
              const isPendingState = payment.status === 'pendiente'
              const isPaid = payment.status === 'pagado'
              const isCancelled = payment.status === 'anulado'

              const rateNum = Number(exchangeRate)
              const bsEquivalent =
                rateNum > 0
                  ? (payment.amount * rateNum).toLocaleString('es-VE', { minimumFractionDigits: 2 })
                  : null

              return (
                <div className="space-y-4">
                  {/* Tarjeta de Resumen Financiero Principal */}
                  <div className="p-4 border border-border bg-muted/40 space-y-2.5 border-l-2 border-emerald-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Cobro #{payment.id}
                      </span>
                      <Badge
                        variant={
                          isPaid
                            ? 'success'
                            : isOverdue
                              ? 'destructive'
                              : isCancelled
                                ? 'outline'
                                : 'warning'
                        }
                        className="font-mono text-[10px]"
                      >
                        {payment.status}
                      </Badge>
                    </div>

                    <h3 className="text-base font-bold text-foreground">
                      {payment.concept || 'Cobro sin concepto'}
                    </h3>

                    <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1 border-t border-border">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block">Base Principal</span>
                        <div className="text-2xl font-black text-foreground font-mono">
                          {usd.format(payment.amount)}
                        </div>
                      </div>
                      {bsEquivalent && (
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground uppercase block">
                            Equivalente ({rateSource.toUpperCase()} {exchangeRate})
                          </span>
                          <div className="text-sm font-bold text-emerald-300 font-mono">
                            ≈ Bs. {bsEquivalent}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Segmented Tab Selector para el Drawer de Cobros */}
                  <div className="flex items-center gap-1 p-1 bg-muted/80 border border-border font-mono text-xs">
                    <Button
                      type="button"
                      onClick={() => setPaymentDrawerTab('detalle')}
                      variant={paymentDrawerTab === 'detalle' ? 'default' : 'ghost'}
                      className={`h-auto flex-1 py-1.5 uppercase font-bold ${
                        paymentDrawerTab === 'detalle' ? 'shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Detalle 360°
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setPaymentDrawerTab('conciliar')
                        setPayMethod((payment.method as typeof payMethod) || 'transferencia')
                      }}
                      variant={paymentDrawerTab === 'conciliar' ? 'default' : 'ghost'}
                      className={`h-auto flex-1 py-1.5 uppercase font-bold ${
                        paymentDrawerTab === 'conciliar'
                          ? 'bg-emerald-400 text-black shadow-xs hover:bg-emerald-400 hover:text-black'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Check className="size-3" />
                      <span>Conciliar</span>
                      {(isPendingState || isOverdue) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setPaymentDrawerTab('whatsapp')}
                      variant={paymentDrawerTab === 'whatsapp' ? 'default' : 'ghost'}
                      className={`h-auto flex-1 py-1.5 uppercase font-bold ${
                        paymentDrawerTab === 'whatsapp'
                          ? 'bg-emerald-500 text-black shadow-xs hover:bg-emerald-500 hover:text-black'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <MessageSquare className="size-3" />
                      <span>WhatsApp</span>
                    </Button>
                  </div>

                  {/* SUB-VISTA 1: DETALLE 360° */}
                  {paymentDrawerTab === 'detalle' && (
                    <div className="space-y-3">
                      {/* Cliente vinculado */}
                      <div className="p-3.5 bg-card text-card-foreground space-y-1.5 border border-border">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest block">
                          Cliente Registrado
                        </span>
                        <div className="flex items-center justify-between">
                          <strong className="text-sm text-foreground">{clientName}</strong>
                          {custId && (
                            <Link
                              href={`/workspace/crm/clientes/${custId}`}
                              className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                            >
                              <span>Ficha CRM 360°</span>
                              <ArrowRight size={12} />
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Parámetros Operativos */}
                      <div className="grid grid-cols-2 gap-2 p-3 bg-background border border-border">
                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase block">Vencimiento</span>
                          <span className="text-xs text-foreground font-bold">
                            {payment.dueDate ? dateFmt.format(new Date(payment.dueDate)) : '—'}
                          </span>
                          {diffDays !== null && (isPendingState || isOverdue) && (
                            <div className="text-[10px] mt-0.5 font-bold">
                              {diffDays < 0 ? (
                                <span className="text-rose-400">Venció hace {Math.abs(diffDays)}d</span>
                              ) : diffDays === 0 ? (
                                <span className="text-amber-400">Vence hoy</span>
                              ) : (
                                <span className="text-amber-300">En {diffDays}d</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] text-muted-foreground uppercase block">Método Sugerido</span>
                          <span className="text-xs text-foreground font-bold capitalize">
                            {payment.method ? payment.method.replace('_', ' ') : 'Sin especificar'}
                          </span>
                        </div>
                      </div>

                      {/* Notas y Auditoría */}
                      {payment.notes && (
                        <div className="p-3 bg-background border border-border space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase block">
                            Historial / Notas / Conciliación
                          </span>
                          <p className="text-foreground/80 whitespace-pre-wrap text-[11px] font-mono leading-relaxed">
                            {payment.notes}
                          </p>
                        </div>
                      )}

                      {/* Acciones Rápidas In-Situ */}
                      {canEdit && (
                        <div className="pt-2 flex flex-col gap-2">
                          {(isPendingState || isOverdue) && (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={() => {
                                  setPaymentDrawerTab('conciliar')
                                  setPayMethod((payment.method as typeof payMethod) || 'transferencia')
                                  setPayReference('')
                                  setPayNotes('')
                                }}
                                className="h-auto flex-1 gap-1.5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase text-xs shadow-lg shadow-emerald-950"
                              >
                                <Check className="size-3.5" />
                                <span>Conciliar Cobro Ahora</span>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setPaymentDrawerTab('whatsapp')}
                                className="h-auto gap-1.5 px-3.5 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border-emerald-800 text-xs font-bold"
                                title="Enviar recordatorio por WhatsApp"
                              >
                                <MessageSquare className="size-3" />
                                <span>WhatsApp</span>
                              </Button>
                            </div>
                          )}

                          {(isPendingState || isOverdue) && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleCancelPayment(payment.id)}
                              className="h-auto w-full gap-1.5 py-2 text-rose-400 hover:text-rose-300 text-xs font-bold uppercase"
                            >
                              <Ban className="size-3" />
                              <span>Anular Cobro</span>
                            </Button>
                          )}

                          {isCancelled && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleReactivatePayment(payment.id)}
                              className="h-auto w-full gap-1.5 py-2.5 text-foreground text-xs font-bold uppercase"
                            >
                              <RotateCcw className="size-3" />
                              <span>Reactivar Cobro Pendiente</span>
                            </Button>
                          )}

                          {isPaid && (
                            <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-center text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                              <CheckCircle2 size={16} className="text-emerald-400" />
                              <span>Cobro conciliado y registrado como pagado</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-VISTA 2: CONCILIAR PAGO */}
                  {paymentDrawerTab === 'conciliar' && (
                    <div className="space-y-4">
                      {isPaid ? (
                        <div className="p-4 bg-emerald-950/50 border border-emerald-800 text-emerald-300 space-y-2">
                          <div className="flex items-center gap-2 font-bold">
                            <CheckCircle2 size={16} />
                            <span>Cobro Ya Pagado</span>
                          </div>
                          <p className="text-[11px] text-foreground/80">
                            Este cobro ya figura como registrado en el sistema con método:{' '}
                            <strong className="text-foreground capitalize">{payment.method || '—'}</strong>.
                          </p>
                        </div>
                      ) : isCancelled ? (
                        <div className="p-4 bg-muted border border-border space-y-3">
                          <div className="flex items-center gap-2 font-bold text-rose-400">
                            <Ban size={16} />
                            <span>Cobro Anulado</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Este cobro se encuentra anulado. No es posible conciliar ingresos ni adjuntar comprobantes a un cobro inactivo.
                          </p>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleReactivatePayment(payment.id)}
                              className="h-auto w-full gap-1.5 py-2.5 text-foreground text-xs font-bold uppercase"
                            >
                              <RotateCcw className="size-3" />
                              <span>Reactivar Cobro a Pendiente</span>
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          <div className="p-3 bg-muted/60 border border-border flex items-center justify-between">
                            <span className="text-muted-foreground text-xs font-bold uppercase">
                              Conciliación de Ingreso
                            </span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {usd.format(payment.amount)}
                            </span>
                          </div>

                          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground uppercase">
                            <span>Método de Pago Real</span>
                            <select
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                              className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-none focus:border-muted-foreground/40 font-mono"
                            >
                              <option value="pago_movil">Pago Móvil (Bs.)</option>
                              <option value="transferencia">Transferencia Bancaria (Bs.)</option>
                              <option value="zelle">Zelle (USD)</option>
                              <option value="binance">Binance / Cripto (USDT)</option>
                              <option value="efectivo">Efectivo (USD / Bs.)</option>
                              <option value="otro">Otro medio de pago</option>
                            </select>
                          </label>

                          {/* Tasa y cálculo referencial en Bolívares */}
                          {(payMethod === 'pago_movil' || payMethod === 'transferencia') && (
                            <div className="p-3 bg-muted/60 border border-border space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="font-bold text-foreground/80">Tasa Referencial (Bs./USD)</span>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    onClick={() => handleSelectRateSource('bcv')}
                                    variant={rateSource === 'bcv' ? 'default' : 'outline'}
                                    className={`h-auto rounded-none px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                                      rateSource === 'bcv'
                                        ? 'bg-emerald-500 text-black border-emerald-500 hover:bg-emerald-500 hover:text-black'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    BCV
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => handleSelectRateSource('binance')}
                                    variant={rateSource === 'binance' ? 'default' : 'outline'}
                                    className={`h-auto rounded-none px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                                      rateSource === 'binance'
                                        ? 'bg-amber-400 text-black border-amber-400 hover:bg-amber-400 hover:text-black'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    Binance
                                  </Button>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    value={exchangeRate}
                                    onChange={(e) => {
                                      setExchangeRate(e.target.value)
                                      setRateSource('manual')
                                    }}
                                    className="bg-background border border-border px-2 py-0.5 text-xs text-emerald-400 font-mono w-24 text-right focus:outline-none"
                                  />
                                </div>
                              </div>
                              {Number(exchangeRate) > 0 && (
                                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                                  <span className="text-[10px] text-muted-foreground">
                                    Base USD: {usd.format(payment.amount)}
                                  </span>
                                  <div className="text-right text-xs font-mono text-emerald-300 font-bold">
                                    ≈ Bs. {(payment.amount * Number(exchangeRate)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground uppercase">
                            <span>Número de Referencia / Comprobante Bancario</span>
                            <input
                              type="text"
                              value={payReference}
                              onChange={(e) => setPayReference(e.target.value)}
                              placeholder="Ej: Ref #948291 Banesco / TXID Binance"
                              className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-none focus:border-muted-foreground/40 font-mono"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground uppercase">
                            <span>Notas de Auditoría o Conciliación</span>
                            <input
                              type="text"
                              value={payNotes}
                              onChange={(e) => setPayNotes(e.target.value)}
                              placeholder="Observaciones adicionales para el registro..."
                              className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-none focus:border-muted-foreground/40 font-mono"
                            />
                          </label>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setPaymentDrawerTab('detalle')}
                              className="h-auto px-4 py-2 bg-muted hover:bg-muted/60 text-foreground/80 text-xs font-bold uppercase"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              disabled={isPending}
                              onClick={handleConfirmPayment}
                              className="h-auto gap-1.5 px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-black uppercase shadow-lg shadow-emerald-950"
                            >
                              {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3.5" />}
                              <span>Confirmar y Conciliar</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-VISTA 3: WHATSAPP */}
                  {paymentDrawerTab === 'whatsapp' && (
                    <div className="space-y-3.5">
                      <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                        <MessageSquare size={16} className="shrink-0" />
                        <span>Recordatorio pre-formateado con conversión oficial</span>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[11px] text-muted-foreground block uppercase">
                          Vista previa del mensaje para {clientName}:
                        </span>
                        <textarea
                          readOnly
                          rows={10}
                          value={generatePaymentReminderText(payment)}
                          className="w-full bg-background border border-border p-3 text-xs text-emerald-300 font-mono focus:outline-none select-all leading-relaxed"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(generatePaymentReminderText(payment))
                            setCopiedReminder(true)
                            setTimeout(() => setCopiedReminder(false), 2500)
                          }}
                          className="h-auto gap-1.5 px-3.5 py-2 bg-muted hover:bg-muted/60 text-foreground text-xs font-bold font-mono"
                        >
                          {copiedReminder ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                          <span>{copiedReminder ? '¡Copiado!' : 'Copiar Mensaje'}</span>
                        </Button>

                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(generatePaymentReminderText(payment))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-emerald-950 font-mono"
                        >
                          <Share2 size={13} />
                          <span>Abrir WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* === CASO 2: COTIZACIÓN (QUOTE) === */}
            {activeDoc.kind === 'quote' && (() => {
              const q = activeDoc.data
              const url = pdfUrl(q)
              const canConvert = q.status === 'draft' || q.status === 'sent'

              return (
                <div className="space-y-4">
                  {/* Cabecera Cotización */}
                  <div className="p-4 border border-border bg-muted/40 space-y-2 border-l-2 border-indigo-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        Cotización Comercial
                      </span>
                      <Badge
                        variant={
                          q.status === 'accepted'
                            ? 'success'
                            : q.status === 'rejected' || q.status === 'expired'
                              ? 'destructive'
                              : 'outline'
                        }
                        className="font-mono text-[10px]"
                      >
                        {q.status || 'draft'}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-bold text-foreground font-mono">
                      {q.quoteNumber || `Cotización #${q.id}`}
                    </h3>

                    <div className="text-2xl font-black text-foreground font-mono pt-1">
                      {usd.format(q.total ?? 0)}
                    </div>
                  </div>

                  {/* Datos del Cliente y Enlace CRM */}
                  <div className="p-3.5 bg-card text-card-foreground space-y-2 border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest block">
                      Cliente Vinculado
                    </span>
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-foreground">{q.client?.name || 'Cliente sin nombre'}</strong>
                      {(() => {
                        const custId = getCustomerId(q.client)
                        if (!custId) return null
                        return (
                          <Link
                            href={`/workspace/crm/clientes/${custId}`}
                            className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                          >
                            <span>Ficha CRM 360°</span>
                            <ArrowRight size={12} />
                          </Link>
                        )
                      })()}
                    </div>
                    {q.validUntil && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Válida hasta: {dateFmt.format(new Date(q.validUntil))}
                      </p>
                    )}
                  </div>

                  {/* Desglose de ítems */}
                  {q.items && q.items.length > 0 && (
                    <div className="p-3.5 bg-card text-card-foreground space-y-2 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest block">
                        Líneas de Detalle ({q.items.length})
                      </span>
                      <div className="divide-y divide-border">
                        {q.items.map((it, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-foreground font-medium">{it.description}</p>
                              <span className="text-[10px] text-muted-foreground">
                                {it.quantity} × {usd.format(it.unitPrice)}
                              </span>
                            </div>
                            <span className="font-mono text-foreground font-bold">
                              {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-border flex justify-between font-bold text-foreground">
                        <span>Total Cotizado</span>
                        <span>{usd.format(q.total ?? 0)}</span>
                      </div>
                    </div>
                  )}

                  {/* Acciones Comerciales In-Situ */}
                  {canEdit && (
                    <div className="space-y-2 pt-1">
                      {canConvert && (
                        <Button
                          type="button"
                          onClick={() => handleConvertQuote(q.id)}
                          className="h-auto w-full gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold uppercase text-xs shadow-lg shadow-indigo-950 font-mono"
                        >
                          <FileCheck className="size-3.5" />
                          <span>Facturar con 1 Clic</span>
                        </Button>
                      )}

                      {/* Selector de estados rápido */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-muted-foreground uppercase mr-1">Estado:</span>
                        {(['draft', 'sent', 'accepted', 'rejected', 'expired'] as const).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            onClick={() => handleChangeQuoteStatus(q.id, s)}
                            variant={q.status === s ? 'default' : 'outline'}
                            className={`h-auto px-2 py-1 text-[10px] uppercase font-mono ${
                              q.status === s ? 'font-bold border-primary' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comprobante PDF */}
                  <div className="pt-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted/60 text-indigo-400 hover:text-foreground border border-border font-bold uppercase transition font-mono"
                      >
                        <ExternalLink size={14} />
                        <span>Ver Cotización en PDF</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-muted/40 border border-border text-center text-muted-foreground text-[11px] font-mono">
                        PDF aún no generado por el motor de cotización
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* === CASO 3: FACTURA (INVOICE) === */}
            {activeDoc.kind === 'invoice' && (() => {
              const inv = activeDoc.data
              const url = pdfUrl(inv)

              return (
                <div className="space-y-4">
                  {/* Cabecera Factura */}
                  <div className="p-4 border border-border bg-muted/40 space-y-2 border-l-2 border-sky-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                        Factura Emitida
                      </span>
                      <Badge
                        variant={
                          inv.status === 'paid'
                            ? 'success'
                            : inv.status === 'overdue' || inv.status === 'cancelled'
                              ? 'destructive'
                              : 'outline'
                        }
                        className="font-mono text-[10px]"
                      >
                        {inv.status || 'draft'}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-bold text-foreground font-mono">
                      {inv.invoiceNumber || `Factura #${inv.id}`}
                    </h3>

                    <div className="text-2xl font-black text-foreground font-mono pt-1">
                      {usd.format(inv.total ?? 0)}
                    </div>
                  </div>

                  {/* Datos del Cliente y Enlace CRM */}
                  <div className="p-3.5 bg-card text-card-foreground space-y-2 border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest block">
                      Cliente Vinculado
                    </span>
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-foreground">{inv.client?.name || 'Cliente sin nombre'}</strong>
                      {(() => {
                        const custId = getCustomerId(inv.client)
                        if (!custId) return null
                        return (
                          <Link
                            href={`/workspace/crm/clientes/${custId}`}
                            className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                          >
                            <span>Ficha CRM 360°</span>
                            <ArrowRight size={12} />
                          </Link>
                        )
                      })()}
                    </div>
                    {inv.dueDate && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Vence: {dateFmt.format(new Date(inv.dueDate))}
                      </p>
                    )}
                  </div>

                  {/* Desglose de ítems */}
                  {inv.items && inv.items.length > 0 && (
                    <div className="p-3.5 bg-card text-card-foreground space-y-2 border border-border">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-widest block">
                        Líneas de Detalle ({inv.items.length})
                      </span>
                      <div className="divide-y divide-border">
                        {inv.items.map((it, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-foreground font-medium">{it.description}</p>
                              <span className="text-[10px] text-muted-foreground">
                                {it.quantity} × {usd.format(it.unitPrice)}
                              </span>
                            </div>
                            <span className="font-mono text-foreground font-bold">
                              {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-border flex justify-between font-bold text-foreground">
                        <span>Total Factura</span>
                        <span>{usd.format(inv.total ?? 0)}</span>
                      </div>
                    </div>
                  )}

                  {/* Acciones Fiscales In-Situ */}
                  {canEdit && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground uppercase mr-1">Estado Fiscal:</span>
                        {(['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const).map((s) => (
                          <Button
                            key={s}
                            type="button"
                            onClick={() => handleChangeInvoiceStatus(inv.id, s)}
                            variant={inv.status === s ? 'default' : 'outline'}
                            className={`h-auto px-2 py-1 text-[10px] uppercase font-mono ${
                              inv.status === s ? 'font-bold border-primary' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comprobante PDF */}
                  <div className="pt-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted/60 text-sky-400 hover:text-foreground border border-border font-bold uppercase transition font-mono"
                      >
                        <ExternalLink size={14} />
                        <span>Ver Factura Oficial en PDF</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-muted/40 border border-border text-center text-muted-foreground text-[11px] font-mono">
                        PDF aún no generado por el motor de facturación
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
