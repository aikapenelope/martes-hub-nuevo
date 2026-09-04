'use client'

import React, { useMemo, useState, useTransition } from 'react'
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
import { Drawer } from '@/components/workspace/overlays'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import { QuoteInvoiceCreateDialog } from '@/components/workspace/QuoteInvoiceCreateDialog'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

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

  // Diálogo para registrar pago
  const [payingPayment, setPayingPayment] = useState<Payment | null>(null)
  const [payMethod, setPayMethod] = useState<
    'pago_movil' | 'transferencia' | 'zelle' | 'binance' | 'efectivo' | 'otro'
  >('transferencia')
  const [payNotes, setPayNotes] = useState('')
  const [bcvRate, setBcvRate] = useState<string>('65.00')
  const [payReference, setPayReference] = useState<string>('')

  // Estado para recordatorio de cobro por WhatsApp
  const [reminderPayment, setReminderPayment] = useState<Payment | null>(null)
  const [copiedReminder, setCopiedReminder] = useState(false)

  function generatePaymentReminderText(payment: Payment): string {
    const cName = getClientName(payment.client)
    const dueDateStr = payment.dueDate ? dateFmt.format(new Date(payment.dueDate)) : 'Pronto'
    const nowMs = Date.now()
    const dueMs = payment.dueDate ? new Date(payment.dueDate).getTime() : null
    const diffDays = dueMs ? Math.round((dueMs - nowMs) / 86400000) : 0
    const isOverdue = diffDays < 0

    return (
      `*Recordatorio de Cobro · ${tenantName}*\n\n` +
      `Hola ${cName}, esperamos que estés muy bien.\n\n` +
      `Te recordamos la gestión de pago pendiente por el siguiente concepto:\n` +
      `• *Concepto:* ${payment.concept || 'Servicios profesionales'}\n` +
      `• *Monto a pagar:* ${usd.format(payment.amount)} USD\n` +
      `• *Fecha de vencimiento:* ${dueDateStr}\n` +
      (isOverdue ? `⚠️ _Registra ${Math.abs(diffDays)} día(s) de mora._\n` : '') +
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
    if (!payingPayment) return
    setActionError(null)
    setActionSuccess(null)
    startTransition(async () => {
      const rateNum = Number(bcvRate)
      const bsEquivalent = rateNum > 0 ? (payingPayment.amount * rateNum).toFixed(2) : null
      const noteDetails = [
        payReference ? `Ref: ${payReference}` : null,
        bsEquivalent ? `Tasa BCV: ${bcvRate} (Bs. ${bsEquivalent})` : null,
        payNotes ? payNotes.trim() : null,
      ]
        .filter(Boolean)
        .join(' | ')

      const finalNotes = payingPayment.notes
        ? `${payingPayment.notes}\n[Conciliación]: ${noteDetails}`
        : noteDetails || undefined

      const res = await updatePaymentStatusAction({
        paymentId: payingPayment.id,
        status: 'pagado',
        method: payMethod,
        notes: finalNotes,
      })
      if (!res.ok) {
        setActionError(res.error || 'No se pudo registrar el pago')
      } else {
        setActionSuccess('Pago registrado y conciliado exitosamente')
        setPayingPayment(null)
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
              <PaymentCreateDialog clients={clients} variant="primary" />
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

                    const nowMs = Date.now()
                    const dueMs = p.dueDate ? new Date(p.dueDate).getTime() : null
                    const diffDays = dueMs ? Math.round((dueMs - nowMs) / 86400000) : null

                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedDoc({ kind: 'payment', data: p })}
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
                                  onClick={() => setReminderPayment(p)}
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
                                  onClick={() => setPayingPayment(p)}
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
                    const canConvert = q.status !== 'accepted' && q.status !== 'rejected'

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

      {/* 6. Modal In-Situ: Registrar Pago */}
      {payingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn font-mono text-xs">
          <div className="w-full max-w-md border border-zinc-800 bg-zinc-950 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Confirmación de Cobranza</span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Registrar Pago de {usd.format(payingPayment.amount)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPayingPayment(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-zinc-400 bg-zinc-900/60 p-3 border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">CLIENTE:</span>
                <strong className="text-white text-sm block">{getClientName(payingPayment.client)}</strong>
                {payingPayment.concept && (
                  <span className="text-zinc-400 block mt-1">Concepto: {payingPayment.concept}</span>
                )}
              </div>

              <label className="flex flex-col gap-1 text-[11px] text-zinc-400 uppercase">
                Método de Pago
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                  className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                >
                  <option value="pago_movil">Pago Móvil</option>
                  <option value="transferencia">Transferencia Bancaria</option>
                  <option value="zelle">Zelle</option>
                  <option value="binance">Binance / Cripto</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              {/* Tasa BCV y cálculo en Bolívares */}
              {(payMethod === 'pago_movil' || payMethod === 'transferencia') && (
                <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Tasa BCV Referencial (Bs./USD)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={bcvRate}
                      onChange={(e) => setBcvRate(e.target.value)}
                      className="bg-black border border-zinc-700 px-2 py-0.5 text-xs text-emerald-400 font-mono w-24 text-right"
                    />
                  </div>
                  {Number(bcvRate) > 0 && (
                    <div className="text-right text-xs font-mono text-emerald-300 font-bold">
                      ≈ Bs. {(payingPayment.amount * Number(bcvRate)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              )}

              <label className="flex flex-col gap-1 text-[11px] text-zinc-400 uppercase">
                Número de Referencia Bancaria / Comprobante
                <input
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="Ej: Ref #948291 Banesco"
                  className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-zinc-400 uppercase">
                Notas adicionales (opcional)
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Comentarios o detalles de auditoría"
                  className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => setPayingPayment(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmPayment}
                className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-black uppercase transition flex items-center gap-1.5 shadow-lg shadow-emerald-950 disabled:opacity-50"
              >
                {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                <span>Confirmar Cobro</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Recordatorio de Cobro por WhatsApp */}
      {reminderPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn font-mono text-xs">
          <div className="w-full max-w-lg border border-emerald-800/80 bg-zinc-950 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <MessageSquare size={16} />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Recordatorio de Cobro por WhatsApp
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReminderPayment(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-zinc-400">
                Mensaje pre-formateado para enviar al cliente {getClientName(reminderPayment.client)}:
              </p>
              <textarea
                readOnly
                rows={9}
                value={generatePaymentReminderText(reminderPayment)}
                className="w-full bg-black border border-zinc-800 p-3 text-xs text-emerald-300 font-mono focus:outline-none select-all"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatePaymentReminderText(reminderPayment))
                  setCopiedReminder(true)
                  setTimeout(() => setCopiedReminder(false), 2500)
                }}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-xs font-bold transition flex items-center gap-1.5"
              >
                {copiedReminder ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedReminder ? '¡Copiado!' : 'Copiar Mensaje'}</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(generatePaymentReminderText(reminderPayment))}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-emerald-950"
              >
                <Share2 size={13} />
                <span>Abrir WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 7. Drawer de Detalle Financiero 360° */}
      <Drawer
        open={selectedDoc !== null}
        onClose={() => setSelectedDoc(null)}
        title={
          selectedDoc?.kind === 'payment'
            ? 'Detalle de Cobro'
            : selectedDoc?.kind === 'quote'
              ? 'Detalle de Cotización'
              : 'Detalle de Factura'
        }
      >
        {selectedDoc && (
          <div className="space-y-4 font-mono text-xs">
            {/* Cabecera del Documento */}
            <div className="p-4 oled-subcard space-y-2 border-l-2 border-sky-400">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  {selectedDoc.kind.toUpperCase()}
                </span>
                <StatusBadge
                  tone={
                    selectedDoc.data.status === 'pagado' ||
                    selectedDoc.data.status === 'paid' ||
                    selectedDoc.data.status === 'accepted'
                      ? 'success'
                      : selectedDoc.data.status === 'vencido' ||
                         selectedDoc.data.status === 'rejected' ||
                         selectedDoc.data.status === 'expired' ||
                         selectedDoc.data.status === 'cancelled'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {selectedDoc.data.status}
                </StatusBadge>
              </div>

              <h3 className="text-lg font-bold text-white">
                {selectedDoc.kind === 'payment'
                  ? selectedDoc.data.concept || 'Cobro'
                  : selectedDoc.kind === 'quote'
                    ? selectedDoc.data.quoteNumber || `Cotización #${selectedDoc.data.id}`
                    : selectedDoc.data.invoiceNumber || `Factura #${selectedDoc.data.id}`}
              </h3>

              <div className="text-2xl font-black text-white font-mono pt-1">
                {usd.format(
                  selectedDoc.kind === 'payment'
                    ? selectedDoc.data.amount
                    : selectedDoc.data.total ?? 0,
                )}
              </div>
            </div>

            {/* Datos del Cliente y Enlace CRM */}
            <div className="p-4 oled-card space-y-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">Cliente Vinculado</span>
              <div className="flex items-center justify-between">
                <strong className="text-sm text-white">{getClientName(selectedDoc.data.client)}</strong>
                {(() => {
                  const custId = getCustomerId(selectedDoc.data.client)
                  if (!custId) return null
                  return (
                    <Link
                      href={`/workspace/crm/client/${custId}`}
                      className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                    >
                      <span>Ficha 360°</span>
                      <ArrowRight size={12} />
                    </Link>
                  )
                })()}
              </div>
            </div>

            {/* Desglose de ítems para Cotizaciones / Facturas */}
            {(selectedDoc.kind === 'quote' || selectedDoc.kind === 'invoice') &&
              selectedDoc.data.items &&
              selectedDoc.data.items.length > 0 && (
                <div className="p-4 oled-card space-y-2">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">Líneas de Detalle</span>
                  <div className="divide-y divide-zinc-900">
                    {selectedDoc.data.items.map((it, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{it.description}</p>
                          <span className="text-[10px] text-zinc-500">
                            {it.quantity} x {usd.format(it.unitPrice)}
                          </span>
                        </div>
                        <span className="font-mono text-white font-bold">
                          {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-zinc-900 flex justify-between font-bold text-white">
                    <span>Total</span>
                    <span>{usd.format(selectedDoc.data.total ?? 0)}</span>
                  </div>
                </div>
              )}

            {/* Comprobante PDF */}
            {(selectedDoc.kind === 'quote' || selectedDoc.kind === 'invoice') && (
              <div className="pt-2">
                {pdfUrl(selectedDoc.data) ? (
                  <a
                    href={pdfUrl(selectedDoc.data)!}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-sky-400 hover:text-white border border-zinc-800 font-bold uppercase transition"
                  >
                    <ExternalLink size={14} />
                    <span>Ver Comprobante PDF Oficial</span>
                  </a>
                ) : (
                  <div className="p-3 bg-zinc-900/40 border border-zinc-800 text-center text-zinc-500 text-[11px]">
                    PDF aún no generado por el motor de facturación
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
