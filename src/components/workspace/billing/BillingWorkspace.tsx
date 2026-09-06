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
import { Drawer } from '@/components/workspace/overlays'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
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

interface BillingCard {
  label: string
  value: string
  note: string
  icon: LucideIcon
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
    if (!selectedDoc || selectedDoc.kind !== 'payment') return
    const payment = selectedDoc.data
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
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* 1. Hero del módulo con Quick Dialogs */}
      <PageHero
        eyebrow="Ventas y Finanzas Operativas"
        title="Facturación & Cobranzas"
        description={`Gestión comercial, flujo de cobros y emisión de comprobantes de ${tenantName}.`}
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <QuoteInvoiceCreateDialog kind="quote" clients={clients} offers={offers} />
              <QuoteInvoiceCreateDialog kind="invoice" clients={clients} offers={offers} />
              <PaymentCreateDialog clients={clients} variant="primary" defaultRate={exchangeRate} rateSource={rateSource} />
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
          <button type="button" onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. Indicadores de Salud Financiera (KPIs) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de cobranza">
        {cards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            accent={card.accent}
            note={card.note}
          />
        ))}
      </section>

      {/* 4. Barra de Navegación por Pestañas & Buscador Reactivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-zinc-900/90 py-3 bg-black/40">
        {/* Tabs de vista */}
        <div className="inline-flex flex-wrap items-center bg-zinc-950 border border-zinc-800 p-1 gap-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('todos_cobros')}
            className={`px-3 py-1.5 uppercase transition ${
              activeTab === 'todos_cobros'
                ? 'bg-white text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            Todos los Cobros ({payments.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pendientes')}
            className={`px-3 py-1.5 uppercase transition flex items-center gap-1.5 ${
              activeTab === 'pendientes'
                ? 'bg-amber-500 text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <Clock3 size={13} />
            <span>Por Cobrar</span>
            <span className="text-[10px] opacity-80">
              ({payments.filter((p) => p.status === 'pendiente' || p.status === 'vencido').length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pagados')}
            className={`px-3 py-1.5 uppercase transition flex items-center gap-1.5 ${
              activeTab === 'pagados'
                ? 'bg-emerald-400 text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <Check size={13} />
            <span>Pagados</span>
            <span className="text-[10px] opacity-80">
              ({payments.filter((p) => p.status === 'pagado').length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cotizaciones')}
            className={`px-3 py-1.5 uppercase transition flex items-center gap-1.5 ${
              activeTab === 'cotizaciones'
                ? 'bg-indigo-600 text-white font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <FileText size={13} />
            <span>Cotizaciones ({quotes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('facturas')}
            className={`px-3 py-1.5 uppercase transition flex items-center gap-1.5 ${
              activeTab === 'facturas'
                ? 'bg-sky-400 text-black font-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
            }`}
          >
            <Receipt size={13} />
            <span>Facturas ({invoices.length})</span>
          </button>
        </div>

        {/* Buscador reactivo */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, concepto..."
            className="w-full bg-zinc-950 border border-zinc-800 pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Barra de Tasa Cambiaria Referencial (Base siempre USD) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950 border border-zinc-800/80 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
            <span>Base USD ($)</span>
          </span>
          <span className="text-zinc-400 text-[11px]">
            Precios pactados en dólares. Tasa referencial para cobros en Bolívares:
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de fuente */}
          <div className="inline-flex items-center border border-zinc-800 bg-black p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => handleSelectRateSource('bcv')}
              className={`px-2 py-1 uppercase transition ${
                rateSource === 'bcv'
                  ? 'bg-emerald-500 text-black font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              BCV {liveRates ? `(${liveRates.bcv.rate})` : ''}
            </button>
            <button
              type="button"
              onClick={() => handleSelectRateSource('binance')}
              className={`px-2 py-1 uppercase transition ${
                rateSource === 'binance'
                  ? 'bg-amber-400 text-black font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Binance P2P {liveRates ? `(${liveRates.binance.rate})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setRateSource('manual')}
              className={`px-2 py-1 uppercase transition ${
                rateSource === 'manual'
                  ? 'bg-zinc-700 text-white font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Manual
            </button>
          </div>

          {/* Input de tasa editable en todo momento */}
          <div className="flex items-center gap-1 bg-black border border-zinc-800 px-2 py-1">
            <span className="text-zinc-500 text-[10px]">Bs./USD</span>
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
          <button
            type="button"
            onClick={() => {
              setIsFetchingRates(true)
              void fetchRates(true)
            }}
            disabled={isFetchingRates}
            className="p-1.5 border border-zinc-800 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white transition disabled:opacity-50"
            title="Actualizar tasas en vivo desde API"
          >
            <RotateCcw size={12} className={isFetchingRates ? 'animate-spin text-sky-400' : ''} />
          </button>
        </div>
      </div>

      {/* 5. Vistas de Contenido */}

      {/* 5.A. Tablas de Cobros (Todos / Pendientes / Pagados) */}
      {(activeTab === 'todos_cobros' || activeTab === 'pendientes' || activeTab === 'pagados') && (
        <OledCard className="!p-0 animate-fadeIn">
          {filteredPayments.length === 0 ? (
            <EmptyState>
              {searchQuery
                ? `No se encontraron cobros coincidentes con «${searchQuery}».`
                : 'No hay registros de cobros para este filtro.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Concepto</th>
                    <th className="px-4 py-2.5 font-medium">Monto (USD)</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Vencimiento</th>
                    <th className="px-4 py-2.5 font-medium">Método</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acciones In-Situ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredPayments.map((p) => {
                    const clientName = getClientName(p.client)
                    const isOverdue = p.status === 'vencido'
                    const isPendingState = p.status === 'pendiente'
                    const isPaid = p.status === 'pagado'
                    const isCancelled = p.status === 'anulado'

                    const diffDays = getCalendarDayDiff(p.dueDate, timezone)

                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          setSelectedDoc({ kind: 'payment', data: p })
                          setPaymentDrawerTab('detalle')
                        }}
                        className="hover:bg-zinc-900/50 cursor-pointer transition group"
                      >
                        <td className="px-4 py-3 text-white font-medium group-hover:text-sky-300 transition">
                          {clientName}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 truncate max-w-xs">
                          {p.concept || 'Cobro sin concepto'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          {usd.format(p.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              isOverdue
                                ? 'danger'
                                : isPaid
                                  ? 'success'
                                  : isCancelled
                                    ? 'neutral'
                                    : 'warning'
                            }
                          >
                            {p.status}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
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
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400 capitalize">
                          {p.method ? p.method.replace('_', ' ') : '—'}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {(isPendingState || isOverdue) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDoc({ kind: 'payment', data: p })
                                    setPaymentDrawerTab('whatsapp')
                                  }}
                                  className="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/80 text-[10px] font-mono transition flex items-center gap-1"
                                  title="Enviar recordatorio por WhatsApp"
                                >
                                  <MessageSquare size={11} />
                                  <span>WhatsApp</span>
                                </button>
                              )}

                              {(isPendingState || isOverdue) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDoc({ kind: 'payment', data: p })
                                    setPaymentDrawerTab('conciliar')
                                    setPayMethod((p.method as typeof payMethod) || 'transferencia')
                                    setPayReference('')
                                    setPayNotes('')
                                  }}
                                  className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 text-[10px] font-mono font-bold uppercase transition flex items-center gap-1"
                                  title="Registrar confirmación de pago"
                                >
                                  <Check size={12} />
                                  <span>Registrar Pago</span>
                                </button>
                              )}

                              {(isPendingState || isOverdue) && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelPayment(p.id)}
                                  className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition"
                                  title="Anular cobro"
                                >
                                  <Ban size={13} />
                                </button>
                              )}

                              {isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleReactivatePayment(p.id)}
                                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-mono transition flex items-center gap-1"
                                  title="Reactivar cobro"
                                >
                                  <RotateCcw size={11} />
                                  <span>Reactivar</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="flex items-center justify-between border-t border-zinc-900 px-4 py-3 text-xs font-mono text-zinc-500">
            <span>
              Mostrando {filteredPayments.length} de {payments.length} cobros
            </span>
            <span className="text-zinc-600">Haz clic en cualquier fila para ver el detalle 360°</span>
          </footer>
        </OledCard>
      )}

      {/* 5.B. Pestaña: Cotizaciones (Quotes) */}
      {activeTab === 'cotizaciones' && (
        <OledCard className="!p-0 animate-fadeIn">
          {filteredQuotes.length === 0 ? (
            <EmptyState>
              {searchQuery
                ? `No se encontraron cotizaciones coincidentes con «${searchQuery}».`
                : 'Sin cotizaciones registradas.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
                    <th className="px-4 py-2.5 font-medium">Número</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Total (USD)</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Válida hasta</th>
                    <th className="px-4 py-2.5 font-medium">Comprobante</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acciones Comerciales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredQuotes.map((q) => {
                    const url = pdfUrl(q)
                    const canConvert = q.status === 'draft' || q.status === 'sent'

                    return (
                      <tr
                        key={q.id}
                        onClick={() => setSelectedDoc({ kind: 'quote', data: q })}
                        className="hover:bg-zinc-900/50 cursor-pointer transition group"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-white group-hover:text-indigo-400 transition">
                          {q.quoteNumber || `COT-#${q.id}`}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-medium">
                          {q.client?.name || 'Cliente sin nombre'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          {usd.format(q.total ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              q.status === 'accepted'
                                ? 'success'
                                : q.status === 'rejected' || q.status === 'expired'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {q.status || 'draft'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {q.validUntil ? dateFmt.format(new Date(q.validUntil)) : '—'}
                        </td>
                        <td
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
                            <span className="text-zinc-600 font-mono text-[10px]">Sin PDF</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {canConvert && (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleConvertQuote(q.id)}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] uppercase font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                  title="Crear Factura y Cobro automático a partir de esta cotización"
                                >
                                  {isPending ? <Loader2 size={11} className="animate-spin" /> : <FileCheck size={12} />}
                                  <span>Convertir a Factura</span>
                                </button>
                              )}

                              {q.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeQuoteStatus(q.id, 'sent')}
                                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono text-[10px] transition"
                                >
                                  Marcar Enviada
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="border-t border-zinc-900 px-4 py-3 text-xs font-mono text-zinc-500">
            <span>{filteredQuotes.length} cotizaciones registradas</span>
          </footer>
        </OledCard>
      )}

      {/* 5.C. Pestaña: Facturas (Invoices) */}
      {activeTab === 'facturas' && (
        <OledCard className="!p-0 animate-fadeIn">
          {filteredInvoices.length === 0 ? (
            <EmptyState>
              {searchQuery
                ? `No se encontraron facturas coincidentes con «${searchQuery}».`
                : 'Sin facturas emitidas.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
                    <th className="px-4 py-2.5 font-medium">Factura #</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Total (USD)</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Vencimiento</th>
                    <th className="px-4 py-2.5 font-medium">Comprobante</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {filteredInvoices.map((inv) => {
                    const url = pdfUrl(inv)
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedDoc({ kind: 'invoice', data: inv })}
                        className="hover:bg-zinc-900/50 cursor-pointer transition group"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-white group-hover:text-sky-300 transition">
                          {inv.invoiceNumber || `INV-#${inv.id}`}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 font-medium">
                          {inv.client?.name || 'Cliente sin nombre'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          {usd.format(inv.total ?? 0)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              inv.status === 'paid'
                                ? 'success'
                                : inv.status === 'overdue' || inv.status === 'cancelled'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {inv.status || 'draft'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {inv.dueDate ? dateFmt.format(new Date(inv.dueDate)) : '—'}
                        </td>
                        <td
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
                            <span className="text-zinc-600 font-mono text-[10px]">Sin PDF</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit && (
                            <div className="flex items-center justify-end gap-1.5">
                              {inv.status !== 'paid' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeInvoiceStatus(inv.id, 'paid')}
                                  className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/30 font-mono text-[10px] uppercase font-bold transition flex items-center gap-1"
                                >
                                  <Check size={11} />
                                  <span>Pagada</span>
                                </button>
                              )}
                              {inv.status !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => handleChangeInvoiceStatus(inv.id, 'cancelled')}
                                  className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 transition"
                                  title="Anular factura"
                                >
                                  <Ban size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="border-t border-zinc-900 px-4 py-3 text-xs font-mono text-zinc-500">
            <span>{filteredInvoices.length} facturas emitidas</span>
          </footer>
        </OledCard>
      )}

      {/* 6. Slide-Over Drawer: Terminal Fintech 360° */}
      <Drawer
        open={selectedDoc !== null}
        onClose={() => {
          setSelectedDoc(null)
          setPaymentDrawerTab('detalle')
        }}
        size="xl"
        title={
          selectedDoc?.kind === 'payment'
            ? 'Terminal Fintech · Cobro'
            : selectedDoc?.kind === 'quote'
              ? 'Terminal Comercial · Cotización'
              : 'Terminal Fiscal · Factura'
        }
      >
        {selectedDoc && (
          <div className="space-y-4 font-mono text-xs">
            {/* === CASO 1: COBRO (PAYMENT) === */}
            {selectedDoc.kind === 'payment' && (() => {
              const payment = selectedDoc.data
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
                  <div className="p-4 oled-subcard space-y-2.5 border-l-2 border-emerald-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Cobro #{payment.id}
                      </span>
                      <StatusBadge
                        tone={
                          isPaid
                            ? 'success'
                            : isOverdue
                              ? 'danger'
                              : isCancelled
                                ? 'neutral'
                                : 'warning'
                        }
                      >
                        {payment.status}
                      </StatusBadge>
                    </div>

                    <h3 className="text-base font-bold text-white">
                      {payment.concept || 'Cobro sin concepto'}
                    </h3>

                    <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1 border-t border-zinc-900">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase block">Base Principal</span>
                        <div className="text-2xl font-black text-white font-mono">
                          {usd.format(payment.amount)}
                        </div>
                      </div>
                      {bsEquivalent && (
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-500 uppercase block">
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
                  <div className="flex items-center gap-1 p-1 bg-zinc-900/80 border border-zinc-800 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => setPaymentDrawerTab('detalle')}
                      className={`flex-1 py-1.5 uppercase font-bold text-center transition ${
                        paymentDrawerTab === 'detalle'
                          ? 'bg-white text-black shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Detalle 360°
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentDrawerTab('conciliar')
                        setPayMethod((payment.method as typeof payMethod) || 'transferencia')
                      }}
                      className={`flex-1 py-1.5 uppercase font-bold text-center transition flex items-center justify-center gap-1.5 ${
                        paymentDrawerTab === 'conciliar'
                          ? 'bg-emerald-400 text-black shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Check size={13} />
                      <span>Conciliar</span>
                      {(isPendingState || isOverdue) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentDrawerTab('whatsapp')}
                      className={`flex-1 py-1.5 uppercase font-bold text-center transition flex items-center justify-center gap-1.5 ${
                        paymentDrawerTab === 'whatsapp'
                          ? 'bg-emerald-500 text-black shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <MessageSquare size={13} />
                      <span>WhatsApp</span>
                    </button>
                  </div>

                  {/* SUB-VISTA 1: DETALLE 360° */}
                  {paymentDrawerTab === 'detalle' && (
                    <div className="space-y-3">
                      {/* Cliente vinculado */}
                      <div className="p-3.5 oled-card space-y-1.5 border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                          Cliente Registrado
                        </span>
                        <div className="flex items-center justify-between">
                          <strong className="text-sm text-white">{clientName}</strong>
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
                      <div className="grid grid-cols-2 gap-2 p-3 bg-zinc-950 border border-zinc-850">
                        <div>
                          <span className="text-[10px] text-zinc-500 uppercase block">Vencimiento</span>
                          <span className="text-xs text-zinc-200 font-bold">
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
                          <span className="text-[10px] text-zinc-500 uppercase block">Método Sugerido</span>
                          <span className="text-xs text-zinc-200 font-bold capitalize">
                            {payment.method ? payment.method.replace('_', ' ') : 'Sin especificar'}
                          </span>
                        </div>
                      </div>

                      {/* Notas y Auditoría */}
                      {payment.notes && (
                        <div className="p-3 bg-zinc-950 border border-zinc-850 space-y-1">
                          <span className="text-[10px] text-zinc-500 uppercase block">
                            Historial / Notas / Conciliación
                          </span>
                          <p className="text-zinc-300 whitespace-pre-wrap text-[11px] font-mono leading-relaxed">
                            {payment.notes}
                          </p>
                        </div>
                      )}

                      {/* Acciones Rápidas In-Situ */}
                      {canEdit && (
                        <div className="pt-2 flex flex-col gap-2">
                          {(isPendingState || isOverdue) && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentDrawerTab('conciliar')
                                  setPayMethod((payment.method as typeof payMethod) || 'transferencia')
                                  setPayReference('')
                                  setPayNotes('')
                                }}
                                className="flex-1 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950"
                              >
                                <Check size={14} />
                                <span>Conciliar Cobro Ahora</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPaymentDrawerTab('whatsapp')}
                                className="px-3.5 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 text-xs font-bold transition flex items-center gap-1.5"
                                title="Enviar recordatorio por WhatsApp"
                              >
                                <MessageSquare size={13} />
                                <span>WhatsApp</span>
                              </button>
                            </div>
                          )}

                          {(isPendingState || isOverdue) && (
                            <button
                              type="button"
                              onClick={() => handleCancelPayment(payment.id)}
                              className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 text-rose-400 hover:text-rose-300 border border-zinc-800 text-xs font-bold uppercase transition flex items-center justify-center gap-1.5"
                            >
                              <Ban size={13} />
                              <span>Anular Cobro</span>
                            </button>
                          )}

                          {isCancelled && (
                            <button
                              type="button"
                              onClick={() => handleReactivatePayment(payment.id)}
                              className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-bold uppercase transition flex items-center justify-center gap-1.5"
                            >
                              <RotateCcw size={13} />
                              <span>Reactivar Cobro Pendiente</span>
                            </button>
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
                          <p className="text-[11px] text-zinc-300">
                            Este cobro ya figura como cancelado en el sistema con método:{' '}
                            <strong className="text-white capitalize">{payment.method || '—'}</strong>.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          <div className="p-3 bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
                            <span className="text-zinc-400 text-xs font-bold uppercase">
                              Conciliación de Ingreso
                            </span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {usd.format(payment.amount)}
                            </span>
                          </div>

                          <label className="flex flex-col gap-1.5 text-xs text-zinc-400 uppercase">
                            <span>Método de Pago Real</span>
                            <select
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                              className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
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
                            <div className="p-3 bg-zinc-900/60 border border-zinc-800 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                                <span className="font-bold text-zinc-300">Tasa Referencial (Bs./USD)</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRateSource('bcv')}
                                    className={`px-1.5 py-0.5 text-[9px] uppercase border transition ${
                                      rateSource === 'bcv'
                                        ? 'bg-emerald-500 text-black font-bold border-emerald-500'
                                        : 'border-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                  >
                                    BCV
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectRateSource('binance')}
                                    className={`px-1.5 py-0.5 text-[9px] uppercase border transition ${
                                      rateSource === 'binance'
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
                                    value={exchangeRate}
                                    onChange={(e) => {
                                      setExchangeRate(e.target.value)
                                      setRateSource('manual')
                                    }}
                                    className="bg-black border border-zinc-700 px-2 py-0.5 text-xs text-emerald-400 font-mono w-24 text-right focus:outline-none"
                                  />
                                </div>
                              </div>
                              {Number(exchangeRate) > 0 && (
                                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                                  <span className="text-[10px] text-zinc-500">
                                    Base USD: {usd.format(payment.amount)}
                                  </span>
                                  <div className="text-right text-xs font-mono text-emerald-300 font-bold">
                                    ≈ Bs. {(payment.amount * Number(exchangeRate)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <label className="flex flex-col gap-1.5 text-xs text-zinc-400 uppercase">
                            <span>Número de Referencia / Comprobante Bancario</span>
                            <input
                              type="text"
                              value={payReference}
                              onChange={(e) => setPayReference(e.target.value)}
                              placeholder="Ej: Ref #948291 Banesco / TXID Binance"
                              className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 text-xs text-zinc-400 uppercase">
                            <span>Notas de Auditoría o Conciliación</span>
                            <input
                              type="text"
                              value={payNotes}
                              onChange={(e) => setPayNotes(e.target.value)}
                              placeholder="Observaciones adicionales para el registro..."
                              className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
                            />
                          </label>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
                            <button
                              type="button"
                              onClick={() => setPaymentDrawerTab('detalle')}
                              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase transition"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={handleConfirmPayment}
                              className="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-black uppercase transition flex items-center gap-1.5 shadow-lg shadow-emerald-950 disabled:opacity-50"
                            >
                              {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                              <span>Confirmar y Conciliar</span>
                            </button>
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
                        <span className="text-[11px] text-zinc-400 block uppercase">
                          Vista previa del mensaje para {clientName}:
                        </span>
                        <textarea
                          readOnly
                          rows={10}
                          value={generatePaymentReminderText(payment)}
                          className="w-full bg-black border border-zinc-800 p-3 text-xs text-emerald-300 font-mono focus:outline-none select-all leading-relaxed"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(generatePaymentReminderText(payment))
                            setCopiedReminder(true)
                            setTimeout(() => setCopiedReminder(false), 2500)
                          }}
                          className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-xs font-bold transition flex items-center gap-1.5 font-mono"
                        >
                          {copiedReminder ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                          <span>{copiedReminder ? '¡Copiado!' : 'Copiar Mensaje'}</span>
                        </button>

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
            {selectedDoc.kind === 'quote' && (() => {
              const q = selectedDoc.data
              const url = pdfUrl(q)
              const canConvert = q.status === 'draft' || q.status === 'sent'

              return (
                <div className="space-y-4">
                  {/* Cabecera Cotización */}
                  <div className="p-4 oled-subcard space-y-2 border-l-2 border-indigo-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                        Cotización Comercial
                      </span>
                      <StatusBadge
                        tone={
                          q.status === 'accepted'
                            ? 'success'
                            : q.status === 'rejected' || q.status === 'expired'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {q.status || 'draft'}
                      </StatusBadge>
                    </div>

                    <h3 className="text-lg font-bold text-white font-mono">
                      {q.quoteNumber || `Cotización #${q.id}`}
                    </h3>

                    <div className="text-2xl font-black text-white font-mono pt-1">
                      {usd.format(q.total ?? 0)}
                    </div>
                  </div>

                  {/* Datos del Cliente y Enlace CRM */}
                  <div className="p-4 oled-card space-y-2 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                      Cliente Vinculado
                    </span>
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-white">{q.client?.name || 'Cliente sin nombre'}</strong>
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
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Válida hasta: {dateFmt.format(new Date(q.validUntil))}
                      </p>
                    )}
                  </div>

                  {/* Desglose de ítems */}
                  {q.items && q.items.length > 0 && (
                    <div className="p-4 oled-card space-y-2 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                        Líneas de Detalle ({q.items.length})
                      </span>
                      <div className="divide-y divide-zinc-900">
                        {q.items.map((it, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">{it.description}</p>
                              <span className="text-[10px] text-zinc-500">
                                {it.quantity} × {usd.format(it.unitPrice)}
                              </span>
                            </div>
                            <span className="font-mono text-white font-bold">
                              {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-zinc-900 flex justify-between font-bold text-white">
                        <span>Total Cotizado</span>
                        <span>{usd.format(q.total ?? 0)}</span>
                      </div>
                    </div>
                  )}

                  {/* Acciones Comerciales In-Situ */}
                  {canEdit && (
                    <div className="space-y-2 pt-1">
                      {canConvert && (
                        <button
                          type="button"
                          onClick={() => handleConvertQuote(q.id)}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950 font-mono"
                        >
                          <FileCheck size={14} />
                          <span>Facturar con 1 Clic</span>
                        </button>
                      )}

                      {/* Selector de estados rápido */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-zinc-500 uppercase mr-1">Estado:</span>
                        {(['draft', 'sent', 'accepted', 'rejected', 'expired'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleChangeQuoteStatus(q.id, s)}
                            className={`px-2 py-1 text-[10px] uppercase font-mono border transition ${
                              q.status === s
                                ? 'bg-zinc-200 text-black font-bold border-white'
                                : 'border-zinc-800 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {s}
                          </button>
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
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-indigo-400 hover:text-white border border-zinc-800 font-bold uppercase transition font-mono"
                      >
                        <ExternalLink size={14} />
                        <span>Ver Cotización en PDF</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-zinc-900/40 border border-zinc-800 text-center text-zinc-500 text-[11px] font-mono">
                        PDF aún no generado por el motor de cotización
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* === CASO 3: FACTURA (INVOICE) === */}
            {selectedDoc.kind === 'invoice' && (() => {
              const inv = selectedDoc.data
              const url = pdfUrl(inv)

              return (
                <div className="space-y-4">
                  {/* Cabecera Factura */}
                  <div className="p-4 oled-subcard space-y-2 border-l-2 border-sky-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                        Factura Emitida
                      </span>
                      <StatusBadge
                        tone={
                          inv.status === 'paid'
                            ? 'success'
                            : inv.status === 'overdue' || inv.status === 'cancelled'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {inv.status || 'draft'}
                      </StatusBadge>
                    </div>

                    <h3 className="text-lg font-bold text-white font-mono">
                      {inv.invoiceNumber || `Factura #${inv.id}`}
                    </h3>

                    <div className="text-2xl font-black text-white font-mono pt-1">
                      {usd.format(inv.total ?? 0)}
                    </div>
                  </div>

                  {/* Datos del Cliente y Enlace CRM */}
                  <div className="p-4 oled-card space-y-2 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                      Cliente Vinculado
                    </span>
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-white">{inv.client?.name || 'Cliente sin nombre'}</strong>
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
                      <p className="text-[10px] text-zinc-500 font-mono">
                        Vence: {dateFmt.format(new Date(inv.dueDate))}
                      </p>
                    )}
                  </div>

                  {/* Desglose de ítems */}
                  {inv.items && inv.items.length > 0 && (
                    <div className="p-4 oled-card space-y-2 border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                        Líneas de Detalle ({inv.items.length})
                      </span>
                      <div className="divide-y divide-zinc-900">
                        {inv.items.map((it, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">{it.description}</p>
                              <span className="text-[10px] text-zinc-500">
                                {it.quantity} × {usd.format(it.unitPrice)}
                              </span>
                            </div>
                            <span className="font-mono text-white font-bold">
                              {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-zinc-900 flex justify-between font-bold text-white">
                        <span>Total Factura</span>
                        <span>{usd.format(inv.total ?? 0)}</span>
                      </div>
                    </div>
                  )}

                  {/* Acciones Fiscales In-Situ */}
                  {canEdit && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 uppercase mr-1">Estado Fiscal:</span>
                        {(['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleChangeInvoiceStatus(inv.id, s)}
                            className={`px-2 py-1 text-[10px] uppercase font-mono border transition ${
                              inv.status === s
                                ? 'bg-zinc-200 text-black font-bold border-white'
                                : 'border-zinc-800 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {s}
                          </button>
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
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-sky-400 hover:text-white border border-zinc-800 font-bold uppercase transition font-mono"
                      >
                        <ExternalLink size={14} />
                        <span>Ver Factura Oficial en PDF</span>
                      </a>
                    ) : (
                      <div className="p-3 bg-zinc-900/40 border border-zinc-800 text-center text-zinc-500 text-[11px] font-mono">
                        PDF aún no generado por el motor de facturación
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Drawer>
    </div>
  )
}
