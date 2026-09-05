'use client'

import React, { useState, useTransition, useMemo } from 'react'
import {
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  FileCheck,
  FileText,
  Loader2,
  MessageSquare,
  PackageCheck,
  Plus,
  Search,
  Send,
  Share2,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react'

import type { Client, Lead, Media, Offer, Quote, Segment } from '@/payload-types'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import { OfferCreateDialog } from '@/components/workspace/OfferCreateDialog'
import { Drawer } from '@/components/workspace/overlays'
import { toggleOfferActiveAction } from '@/lib/offer-actions'
import {
  convertQuoteToInvoiceAction,
  createQuoteAction,
  searchRecipientsAction,
  type RecipientSearchResult,
  updateQuoteStatusAction,
} from '@/lib/billing-actions'

const usd = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat('es-VE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

interface OffersWorkspaceProps {
  canEdit: boolean
  tenantName: string
  offers: Offer[]
  segments: Segment[]
  quotes: Quote[]
  clients: Client[]
  leads: Lead[]
  initialTab?: 'catalogo' | 'cotizaciones'
}

export function OffersWorkspace({
  canEdit,
  tenantName,
  offers,
  segments,
  quotes,
  clients,
  leads,
  initialTab = 'catalogo',
}: OffersWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'cotizaciones'>(initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null)
  const [shareQuote, setShareQuote] = useState<Quote | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Diálogo rápido de crear cotización
  const [isCreatingQuote, setIsCreatingQuote] = useState(false)

  // Estado de líneas de la cotización rápida
  const [quoteCustomerType, setQuoteCustomerType] = useState<'client' | 'lead' | 'custom'>('client')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customClientName, setCustomClientName] = useState('')
  const [customClientEmail, setCustomClientEmail] = useState('')
  const [quoteValidDays, setQuoteValidDays] = useState('15')
  const [quoteNotes, setQuoteNotes] = useState('Validez de 15 días continuos. Forma de pago: 50% anticipo y 50% al finalizar.')

  const validUntilDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + Number(quoteValidDays))
    return d.toISOString().slice(0, 10)
  }, [quoteValidDays])

  // Líneas dinámicas
  const [items, setItems] = useState<
    { productId: string; description: string; quantity: number; unitPrice: number; taxRate: number }[]
  >([
    { productId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0.16 },
  ])

  // Métricas agregadas
  const activeOffers = offers.filter((o) => o.active)
  const avgOfferPrice = offers.length > 0 ? offers.reduce((acc, o) => acc + o.price, 0) / offers.length : 0

  const activeQuotes = quotes.filter((q) => q.status === 'draft' || q.status === 'sent')
  const activeQuotesTotal = activeQuotes.reduce((acc, q) => acc + (q.total || 0), 0)
  const acceptedQuotes = quotes.filter((q) => q.status === 'accepted')
  const acceptedQuotesTotal = acceptedQuotes.reduce((acc, q) => acc + (q.total || 0), 0)

  // Filtrado
  const filteredOffers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return offers
    return offers.filter((o) => {
      const segName = typeof o.segment === 'object' && o.segment ? o.segment.name : ''
      return (
        o.name.toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q) ||
        segName.toLowerCase().includes(q)
      )
    })
  }, [offers, searchQuery])

  // Paginación de Cotizaciones
  const [quotePage, setQuotePage] = useState(1)
  const QUOTES_PER_PAGE = 20

  const filteredQuotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return quotes
    return quotes.filter((quote) => {
      const cName = quote.client?.name || ''
      const num = quote.quoteNumber || ''
      return cName.toLowerCase().includes(q) || num.toLowerCase().includes(q)
    })
  }, [quotes, searchQuery])

  const totalQuotePages = Math.max(1, Math.ceil(filteredQuotes.length / QUOTES_PER_PAGE))
  const paginatedQuotes = useMemo(() => {
    const start = (quotePage - 1) * QUOTES_PER_PAGE
    return filteredQuotes.slice(start, start + QUOTES_PER_PAGE)
  }, [filteredQuotes, quotePage])

  // Búsqueda interactiva de Destinatarios (Clientes y Prospectos) sin límite de carga
  const [recipientQuery, setRecipientQuery] = useState('')
  const [remoteRecipients, setRemoteRecipients] = useState<RecipientSearchResult[]>([])
  const [isSearchingRecipients, setIsSearchingRecipients] = useState(false)

  const handleSearchRecipients = async (query: string) => {
    setRecipientQuery(query)
    const q = query.trim()
    if (q.length < 2) {
      setRemoteRecipients([])
      return
    }
    setIsSearchingRecipients(true)
    try {
      const results = await searchRecipientsAction(q)
      setRemoteRecipients(results)
    } catch {
      // Manejo silencioso
    } finally {
      setIsSearchingRecipients(false)
    }
  }

  const displayedClients = useMemo(() => {
    const q = recipientQuery.toLowerCase().trim()
    const fromProps = q
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.companyName || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q),
        )
      : clients

    const remoteClients = remoteRecipients
      .filter((r) => r.type === 'client' && r.customerId)
      .map((r) => ({
        id: r.customerId!,
        name: r.name,
        companyName: r.companyName || null,
        email: r.email || null,
      })) as Client[]

    const map = new Map<number, Client>()
    for (const c of fromProps) map.set(c.id, c)
    for (const c of remoteClients) map.set(c.id, c)
    return Array.from(map.values())
  }, [clients, recipientQuery, remoteRecipients])

  const displayedLeads = useMemo(() => {
    const q = recipientQuery.toLowerCase().trim()
    const fromProps = q
      ? leads.filter(
          (l) =>
            l.fullName.toLowerCase().includes(q) ||
            (l.companyName || '').toLowerCase().includes(q) ||
            (l.email || '').toLowerCase().includes(q),
        )
      : leads

    const remoteLeads = remoteRecipients
      .filter((r) => r.type === 'lead')
      .map((r) => ({
        id: Number(r.id.replace('lead_', '')) || 0,
        fullName: r.name,
        companyName: r.companyName || null,
        email: r.email || null,
        status: 'prospecto',
      })) as unknown as Lead[]

    const map = new Map<string, Lead>()
    for (const l of fromProps) map.set(l.fullName, l)
    for (const l of remoteLeads) map.set(l.fullName, l)
    return Array.from(map.values())
  }, [leads, recipientQuery, remoteRecipients])

  function getPdfUrl(doc: Quote): string | null {
    const first = doc.generatedPdfs?.[0]
    if (first && typeof first === 'object') return (first as Media).url ?? null
    return null
  }

  function handleOpenQuoteBuilder(withOffer?: Offer) {
    if (withOffer) {
      setItems([
        {
          productId: String(withOffer.id),
          description: withOffer.name + (withOffer.description ? ` — ${withOffer.description}` : ''),
          quantity: 1,
          unitPrice: withOffer.price,
          taxRate: 0.16,
        },
      ])
    } else {
      setItems([{ productId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0.16 }])
    }
    setIsCreatingQuote(true)
  }

  function handleProductSelect(index: number, offerId: string) {
    const next = [...items]
    if (!offerId) {
      next[index] = { ...next[index], productId: '', description: '', unitPrice: 0 }
    } else {
      const offer = offers.find((o) => String(o.id) === offerId)
      if (offer) {
        next[index] = {
          ...next[index],
          productId: String(offer.id),
          description: offer.name + (offer.description ? ` — ${offer.description}` : ''),
          unitPrice: offer.price,
        }
      }
    }
    setItems(next)
  }

  function handleAddItem() {
    if (items.length >= 6) return
    setItems([...items, { productId: '', description: '', quantity: 1, unitPrice: 0, taxRate: 0.16 }])
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  // Cálculos en vivo del formulario
  const subtotalCalc = items.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0), 0)
  const taxCalc = items.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitPrice || 0) * (it.taxRate || 0), 0)
  const totalCalc = subtotalCalc + taxCalc

  // Generación de texto para compartir por WhatsApp
  function generateWhatsAppText(quote: Quote): string {
    const clientName = quote.client?.name || 'Estimado(a)'
    const lines = (quote.items || [])
      .map(
        (it) =>
          `• *${it.description}* (${it.quantity}x ${usd.format(it.unitPrice)}) = ${usd.format(it.lineTotal || it.quantity * it.unitPrice)}`,
      )
      .join('\n')

    const pdfLink = getPdfUrl(quote)
    const validUntilStr = quote.validUntil ? dateFmt.format(new Date(quote.validUntil)) : '15 días'

    return (
      `*Presupuesto ${quote.quoteNumber || `COT-${quote.id}`} · ${tenantName}*\n\n` +
      `Hola ${clientName}, te compartimos el presupuesto cotizado:\n\n` +
      `${lines}\n\n` +
      `*Total:* ${usd.format(quote.total || 0)} USD\n` +
      `*Válido hasta:* ${validUntilStr}\n\n` +
      (pdfLink ? `📄 Puedes descargar el comprobante oficial aquí:\n${pdfLink}\n\n` : '') +
      `Quedamos a tu completa disposición para iniciar el proyecto.`
    )
  }

  function handleCopyWhatsAppText(quote: Quote) {
    const text = generateWhatsAppText(quote)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function handleConvertQuote(quoteId: number) {
    if (!canEdit) return
    startTransition(async () => {
      const res = await convertQuoteToInvoiceAction({ quoteId })
      if (res.ok) {
        setActionNotice({ type: 'success', text: `Cotización #${quoteId} convertida a Factura exitosamente.` })
      } else {
        setActionNotice({ type: 'error', text: res.error || 'Error al convertir la cotización' })
      }
      setTimeout(() => setActionNotice(null), 5000)
    })
  }

  function handleChangeStatus(quoteId: number, status: 'sent' | 'accepted' | 'rejected') {
    if (!canEdit) return
    startTransition(async () => {
      const res = await updateQuoteStatusAction({ quoteId, status })
      if (res.ok) {
        setActionNotice({ type: 'success', text: `Estado actualizado a «${status}».` })
      } else {
        setActionNotice({ type: 'error', text: res.error || 'Error al actualizar estado' })
      }
      setTimeout(() => setActionNotice(null), 4000)
    })
  }

  return (
    <div className="space-y-4">
      {/* Notificación flotante de acción */}
      {actionNotice && (
        <div
          className={`p-3 text-xs font-mono border flex items-center justify-between transition-all ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              : 'bg-rose-950/80 border-rose-700 text-rose-300'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      <PageHero
        eyebrow={`Comercial & Cotizaciones · ${tenantName}`}
        title="Ofertas y Presupuestos"
        description="Gestión integral de servicios, catálogo de precios base y emisión de cotizaciones con envío por WhatsApp."
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleOpenQuoteBuilder()}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 transition shadow-sm"
              >
                <FileText size={14} />
                <span>Nueva Cotización</span>
              </button>
              <OfferCreateDialog segments={segments.map((s) => ({ id: s.id, name: s.name }))} />
            </div>
          ) : undefined
        }
      />

      {/* KPI Cards de resumen comercial */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ofertas activas"
          value={activeOffers.length}
          icon={PackageCheck}
          accent="sky"
          note={`${offers.length} en el catálogo base`}
        />
        <KpiCard
          label="En Negociación"
          value={usd.format(activeQuotesTotal)}
          icon={CircleDollarSign}
          accent="amber"
          note={`${activeQuotes.length} cotizaciones abiertas`}
        />
        <KpiCard
          label="Cotizaciones Ganadas"
          value={usd.format(acceptedQuotesTotal)}
          icon={CheckCircle2}
          accent="cyan"
          note={`${acceptedQuotes.length} aceptadas / convertidas`}
        />
        <KpiCard
          label="Precio promedio catálogo"
          value={usd.format(avgOfferPrice)}
          icon={TrendingUp}
          accent="cyan"
          note="Base unitaria de servicios"
        />
      </section>

      {/* Selector de Pestañas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('catalogo')}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 ${
              activeTab === 'catalogo'
                ? 'bg-zinc-800 text-white font-bold border-b-2 border-sky-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Tag size={13} />
            <span>Catálogo de Ofertas ({offers.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cotizaciones')}
            className={`px-3 py-1.5 transition flex items-center gap-1.5 ${
              activeTab === 'cotizaciones'
                ? 'bg-zinc-800 text-white font-bold border-b-2 border-amber-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <FileText size={13} />
            <span>Cotizaciones Emitidas ({quotes.length})</span>
          </button>
        </div>

        {/* Buscador reactivo */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={activeTab === 'catalogo' ? 'Buscar oferta o rubro...' : 'Buscar cliente o cotización #...'}
          className="bg-black border border-zinc-800 px-3 py-1 text-xs text-white placeholder:text-zinc-600 font-mono w-64 focus:outline-none focus:border-zinc-600"
        />
      </div>

      {/* CONTENIDO TAB 1: CATÁLOGO DE OFERTAS */}
      {activeTab === 'catalogo' && (
        <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 animate-fadeIn">
          {filteredOffers.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <OledCard>
                <EmptyState>
                  {searchQuery
                    ? `No se encontraron ofertas coincidentes con «${searchQuery}».`
                    : 'Sin ofertas registradas para este tenant todavía.'}
                </EmptyState>
              </OledCard>
            </div>
          ) : (
            filteredOffers.map((o) => {
              const segmentName = typeof o.segment === 'object' && o.segment ? o.segment.name : null
              return (
                <article key={o.id} className="oled-card flex flex-col gap-2.5 p-4 justify-between group">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-bold text-white group-hover:text-sky-300 transition">
                        {o.name}
                      </strong>
                      <StatusBadge tone={o.active ? 'success' : 'neutral'}>
                        {o.active ? 'Activa' : 'Pausada'}
                      </StatusBadge>
                    </div>
                    {o.description && (
                      <p className="text-xs leading-relaxed text-zinc-400">{o.description}</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-900 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-base font-black text-white font-mono">
                        <CircleDollarSign className="h-4 w-4 text-sky-400" />
                        {usd.format(o.price)}
                      </span>
                      {segmentName && (
                        <span className="flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                          <Tag className="h-3 w-3" />
                          {segmentName}
                        </span>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-900/50">
                        <button
                          type="button"
                          onClick={() => handleOpenQuoteBuilder(o)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-sky-400 hover:text-sky-300 font-bold"
                        >
                          <Plus size={12} />
                          <span>Cotizar esto</span>
                        </button>

                        <form action={toggleOfferActiveAction} className="text-right">
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            type="submit"
                            className="text-[10px] text-zinc-500 font-mono uppercase transition hover:text-white"
                          >
                            {o.active ? 'Pausar' : 'Activar'}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </section>
      )}

      {/* CONTENIDO TAB 2: COTIZACIONES EMITIDAS */}
      {activeTab === 'cotizaciones' && (
        <OledCard className="!p-0 animate-fadeIn">
          {filteredQuotes.length === 0 ? (
            <EmptyState>
              {searchQuery
                ? `No se encontraron cotizaciones para «${searchQuery}».`
                : 'Sin cotizaciones emitidas en este workspace aún.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
                    <th className="px-4 py-2.5 font-medium">Cotización #</th>
                    <th className="px-4 py-2.5 font-medium">Cliente / Prospecto</th>
                    <th className="px-4 py-2.5 font-medium">Total (USD)</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium">Válida Hasta</th>
                    <th className="px-4 py-2.5 font-medium">PDF</th>
                    <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {paginatedQuotes.map((q) => {
                    const url = getPdfUrl(q)
                    const isAccepted = q.status === 'accepted'
                    return (
                      <tr
                        key={q.id}
                        onClick={() => setSelectedQuote(q)}
                        className="hover:bg-zinc-900/50 cursor-pointer transition group"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-white group-hover:text-sky-300 transition">
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
                                  : q.status === 'sent'
                                    ? 'warning'
                                    : 'neutral'
                            }
                          >
                            {q.status === 'draft'
                              ? 'Borrador'
                              : q.status === 'sent'
                                ? 'Enviada'
                                : q.status === 'accepted'
                                  ? 'Aprobada'
                                  : q.status === 'rejected'
                                    ? 'Rechazada'
                                    : q.status || 'draft'}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-400">
                          {q.validUntil ? dateFmt.format(new Date(q.validUntil)) : '—'}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Compartir WhatsApp */}
                            <button
                              type="button"
                              onClick={() => setShareQuote(q)}
                              className="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/80 font-mono text-[10px] transition flex items-center gap-1"
                              title="Compartir por WhatsApp"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp</span>
                            </button>

                            {/* Convertir a Factura */}
                            {canEdit && !isAccepted && (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleConvertQuote(q.id)}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] uppercase font-bold transition flex items-center gap-1 disabled:opacity-50"
                                title="Aprobar y generar Factura/Cobro"
                              >
                                {isPending ? <Loader2 size={11} className="animate-spin" /> : <FileCheck size={11} />}
                                <span>Facturar</span>
                              </button>
                            )}

                            {/* Marcar Enviada si es borrador */}
                            {canEdit && q.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => handleChangeStatus(q.id, 'sent')}
                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono text-[10px] transition"
                              >
                                Marcar Enviada
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <footer className="border-t border-zinc-900 px-4 py-3 text-xs font-mono text-zinc-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              Mostrando {paginatedQuotes.length} de {filteredQuotes.length} cotizaciones
            </span>
            {totalQuotePages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={quotePage <= 1}
                  onClick={() => setQuotePage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 disabled:opacity-40 hover:text-white transition text-[11px]"
                >
                  Anterior
                </button>
                <span className="text-zinc-400 text-[11px]">
                  Página {quotePage} de {totalQuotePages}
                </span>
                <button
                  type="button"
                  disabled={quotePage >= totalQuotePages}
                  onClick={() => setQuotePage((p) => Math.min(totalQuotePages, p + 1))}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 disabled:opacity-40 hover:text-white transition text-[11px]"
                >
                  Siguiente
                </button>
              </div>
            )}
          </footer>
        </OledCard>
      )}

      {/* DIÁLOGO: CONSTRUCTOR DE NUEVA COTIZACIÓN RÁPIDA */}
      {isCreatingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4 text-white shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                <FileText size={16} className="text-sky-400" />
                <span>Emitir Cotización Comercial</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsCreatingQuote(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form action={createQuoteAction} className="space-y-4">
              <input type="hidden" name="redirectTo" value="/workspace/offers" />

              {/* Selector de Cliente o Lead */}
              <div className="p-3 bg-zinc-900/40 border border-zinc-850 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Destinatario de la Cotización</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="custTypeRadio"
                        checked={quoteCustomerType === 'client'}
                        onChange={() => setQuoteCustomerType('client')}
                      />
                      <span>Cliente</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="custTypeRadio"
                        checked={quoteCustomerType === 'lead'}
                        onChange={() => setQuoteCustomerType('lead')}
                      />
                      <span>Lead CRM</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="custTypeRadio"
                        checked={quoteCustomerType === 'custom'}
                        onChange={() => setQuoteCustomerType('custom')}
                      />
                      <span>Manual</span>
                    </label>
                  </div>
                </div>

                {quoteCustomerType !== 'custom' && (
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={recipientQuery}
                      onChange={(e) => void handleSearchRecipients(e.target.value)}
                      placeholder="Escribe para buscar destinatario en todo el CRM..."
                      className="w-full bg-black border border-zinc-800 pl-8 pr-8 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-sky-500"
                    />
                    {isSearchingRecipients && (
                      <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-sky-400" />
                    )}
                  </div>
                )}

                {quoteCustomerType === 'client' && (
                  <select
                    name="customer"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                    required
                  >
                    <option value="">
                      Selecciona un cliente del CRM ({displayedClients.length} disponibles)...
                    </option>
                    {displayedClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.companyName ? `(${c.companyName})` : ''} {c.email ? `· ${c.email}` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {quoteCustomerType === 'lead' && (
                  <select
                    name="clientName"
                    onChange={(e) => {
                      const leadObj = displayedLeads.find((l) => l.fullName === e.target.value)
                      if (leadObj?.email) setCustomClientEmail(leadObj.email)
                    }}
                    className="w-full bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                    required
                  >
                    <option value="">
                      Selecciona un prospecto del CRM ({displayedLeads.length} disponibles)...
                    </option>
                    {displayedLeads.map((l) => (
                      <option key={l.id} value={l.fullName}>
                        {l.fullName} {l.companyName ? `(${l.companyName})` : ''} {l.email ? `· ${l.email}` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {quoteCustomerType === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      name="clientName"
                      type="text"
                      placeholder="Nombre del Cliente o Empresa"
                      value={customClientName}
                      onChange={(e) => setCustomClientName(e.target.value)}
                      className="bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                      required
                    />
                    <input
                      name="clientEmail"
                      type="email"
                      placeholder="Correo Electrónico (opcional)"
                      value={customClientEmail}
                      onChange={(e) => setCustomClientEmail(e.target.value)}
                      className="bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                )}
              </div>

              {/* Detalle de Conceptos / Ofertas */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="uppercase tracking-wider text-[11px]">Líneas de Servicios / Ofertas</span>
                  {items.length < 6 && (
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-sky-400 hover:text-sky-300 text-[10px] font-bold flex items-center gap-1"
                    >
                      <Plus size={12} />
                      <span>Agregar Fila</span>
                    </button>
                  )}
                </div>

                {items.map((it, idx) => (
                  <div key={idx} className="p-3 bg-zinc-900/50 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-500">Ítem #{idx + 1}</span>
                      {/* Selector de oferta predefinida */}
                      <select
                        value={it.productId}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                        className="bg-black border border-zinc-800 text-[10px] text-sky-400 px-2 py-1 max-w-xs focus:outline-none"
                      >
                        <option value="">(Cargar desde Catálogo de Ofertas...)</option>
                        {offers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} — {usd.format(o.price)}
                          </option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <input
                      type="hidden"
                      name={`item${idx}_product`}
                      value={it.productId || ''}
                    />

                    <input
                      name={`item${idx}_description`}
                      value={it.description}
                      onChange={(e) => {
                        const next = [...items]
                        next[idx].description = e.target.value
                        setItems(next)
                      }}
                      placeholder="Descripción del servicio cotizado"
                      className="w-full bg-black border border-zinc-800 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                      required
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
                        Cantidad
                        <input
                          name={`item${idx}_quantity`}
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx].quantity = Math.max(1, Number(e.target.value))
                            setItems(next)
                          }}
                          className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
                        Precio Unitario (USD)
                        <input
                          name={`item${idx}_unitPrice`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unitPrice}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx].unitPrice = Math.max(0, Number(e.target.value))
                            setItems(next)
                          }}
                          className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
                        Impuesto
                        <select
                          name={`item${idx}_taxRate`}
                          value={it.taxRate}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx].taxRate = Number(e.target.value)
                            setItems(next)
                          }}
                          className="bg-black border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                        >
                          <option value="0.16">IVA 16%</option>
                          <option value="0">Exento (0%)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resumen numérico */}
              <div className="p-3 bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">Total Cotizado:</span>
                <div className="text-right">
                  <span className="text-lg font-black text-white">{usd.format(totalCalc)}</span>
                  <span className="text-[10px] text-zinc-500 block">
                    (Subtotal {usd.format(subtotalCalc)} + IVA {usd.format(taxCalc)})
                  </span>
                </div>
              </div>

              {/* Validez y Notas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                  Días de Validez
                  <select
                    value={quoteValidDays}
                    onChange={(e) => setQuoteValidDays(e.target.value)}
                    className="bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="7">7 Días</option>
                    <option value="15">15 Días</option>
                    <option value="30">30 Días</option>
                  </select>
                  <input
                    type="hidden"
                    name="validUntil"
                    value={validUntilDate}
                  />
                </label>
                <label className="sm:col-span-2 flex flex-col gap-1 text-[10px] text-zinc-400">
                  Condiciones / Notas
                  <input
                    name="notes"
                    type="text"
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                    className="bg-black border border-zinc-800 px-2 py-1.5 text-xs text-white"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingQuote(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-400 hover:bg-sky-300 text-black text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 shadow-lg shadow-sky-950"
                >
                  <Send size={13} />
                  <span>Emitir Cotización</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA COMPARTIR POR WHATSAPP */}
      {shareQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg border border-emerald-800/80 bg-zinc-950 p-6 space-y-4 text-white shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-emerald-400">
                <MessageSquare size={16} />
                <span>Compartir Cotización por WhatsApp</span>
              </h2>
              <button
                type="button"
                onClick={() => setShareQuote(null)}
                className="text-zinc-500 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-zinc-400">
                Mensaje formateado listo para enviar al cliente {shareQuote.client?.name}:
              </p>
              <textarea
                readOnly
                rows={8}
                value={generateWhatsAppText(shareQuote)}
                className="w-full bg-black border border-zinc-800 p-3 text-xs text-emerald-300 font-mono focus:outline-none select-all"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => handleCopyWhatsAppText(shareQuote)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 text-xs font-bold transition flex items-center gap-1.5"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(generateWhatsAppText(shareQuote))}`}
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

      {/* DRAWER DE DETALLE DE COTIZACIÓN */}
      <Drawer
        open={selectedQuote !== null}
        onClose={() => setSelectedQuote(null)}
        title="Ficha de Cotización"
      >
        {selectedQuote && (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-4 oled-subcard space-y-2 border-l-2 border-amber-400">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  {selectedQuote.quoteNumber || `COT-#${selectedQuote.id}`}
                </span>
                <StatusBadge tone={selectedQuote.status === 'accepted' ? 'success' : 'neutral'}>
                  {selectedQuote.status || 'draft'}
                </StatusBadge>
              </div>

              <h3 className="text-lg font-bold text-white">
                {selectedQuote.client?.name || 'Cliente sin nombre'}
              </h3>

              <div className="text-2xl font-black text-white font-mono pt-1">
                {usd.format(selectedQuote.total ?? 0)}
              </div>
            </div>

            {/* Desglose de ítems */}
            {selectedQuote.items && selectedQuote.items.length > 0 && (
              <div className="p-4 oled-card space-y-2">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">
                  Conceptos Cotizados
                </span>
                <div className="divide-y divide-zinc-900">
                  {selectedQuote.items.map((it, idx) => (
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
                  <span>{usd.format(selectedQuote.total ?? 0)}</span>
                </div>
              </div>
            )}

            {/* Botón de PDF */}
            {getPdfUrl(selectedQuote) && (
              <a
                href={getPdfUrl(selectedQuote)!}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-sky-400 hover:text-white border border-zinc-800 font-bold uppercase transition"
              >
                <ExternalLink size={14} />
                <span>Ver PDF Oficial</span>
              </a>
            )}

            {/* Acciones del Drawer */}
            {canEdit && selectedQuote.status !== 'accepted' && (
              <div className="pt-3 border-t border-zinc-850 space-y-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    handleConvertQuote(selectedQuote.id)
                    setSelectedQuote(null)
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase text-xs transition flex items-center justify-center gap-1.5"
                >
                  <FileCheck size={14} />
                  <span>Aprobar y Facturar (1 Clic)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
