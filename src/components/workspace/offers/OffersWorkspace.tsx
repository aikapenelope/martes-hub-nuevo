'use client'

import React, { useState, useTransition, useMemo, useRef } from 'react'
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
import { useRouter } from 'next/navigation'
import { cn } from 'cn'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
import { OfferCreateDialog } from '@/components/workspace/OfferCreateDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  const router = useRouter()
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
  // Página efectiva acotada al rango del filtro actual: evita "páginas vacías"
  // cuando la búsqueda reduce el total de resultados.
  const safeQuotePage = Math.min(quotePage, totalQuotePages)
  const paginatedQuotes = useMemo(() => {
    const start = (safeQuotePage - 1) * QUOTES_PER_PAGE
    return filteredQuotes.slice(start, start + QUOTES_PER_PAGE)
  }, [filteredQuotes, safeQuotePage])

  // Búsqueda interactiva de Destinatarios (Clientes y Prospectos) sin límite de carga
  const [recipientQuery, setRecipientQuery] = useState('')
  const [remoteRecipients, setRemoteRecipients] = useState<RecipientSearchResult[]>([])
  const [isSearchingRecipients, setIsSearchingRecipients] = useState(false)
  const recipientSearchSeqRef = useRef(0)

  const handleSearchRecipients = async (query: string) => {
    setRecipientQuery(query)
    const q = query.trim()
    const seq = ++recipientSearchSeqRef.current
    if (q.length < 2) {
      setRemoteRecipients([])
      setIsSearchingRecipients(false)
      return
    }
    setIsSearchingRecipients(true)
    try {
      const results = await searchRecipientsAction(q)
      // Ignora respuestas fuera de orden: solo la búsqueda más reciente actualiza resultados
      if (seq === recipientSearchSeqRef.current) {
        setRemoteRecipients(results)
      }
    } catch {
      // Manejo silencioso
    } finally {
      if (seq === recipientSearchSeqRef.current) {
        setIsSearchingRecipients(false)
      }
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
        // Refresca datos del servidor y sincroniza el estado local para que la
        // cotización convertida deje de ser facturable sin recargar manualmente
        router.refresh()
        setSelectedQuote((prev) =>
          prev && prev.id === quoteId ? { ...prev, status: 'accepted' } : prev,
        )
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
        // Refresca datos del servidor y sincroniza el estado local de la cotización
        router.refresh()
        setSelectedQuote((prev) => (prev && prev.id === quoteId ? { ...prev, status } : prev))
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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Cerrar aviso"
            onClick={() => setActionNotice(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      <PageHeader
        eyebrow={`Comercial & Cotizaciones · ${tenantName}`}
        title="Ofertas y Presupuestos"
        description="Gestión integral de servicios, catálogo de precios base y emisión de cotizaciones con envío por WhatsApp."
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => handleOpenQuoteBuilder()}
                className="bg-sky-500 font-mono text-xs font-bold uppercase tracking-wider text-black shadow-sm hover:bg-sky-400"
              >
                <FileText size={14} />
                <span>Nueva Cotización</span>
              </Button>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-1 font-mono text-xs">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab('catalogo')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-mono text-xs transition',
              activeTab === 'catalogo'
                ? 'border-sky-400 bg-muted font-bold text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Tag size={13} />
            <span>Catálogo de Ofertas ({offers.length})</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActiveTab('cotizaciones')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-mono text-xs transition',
              activeTab === 'cotizaciones'
                ? 'border-amber-400 bg-muted font-bold text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <FileText size={13} />
            <span>Cotizaciones Emitidas ({quotes.length})</span>
          </Button>
        </div>

        {/* Buscador reactivo */}
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setQuotePage(1)
          }}
          placeholder={activeTab === 'catalogo' ? 'Buscar oferta o rubro...' : 'Buscar cliente o cotización #...'}
          className="h-7 w-64 bg-background px-3 font-mono text-xs"
        />
      </div>

      {/* CONTENIDO TAB 1: CATÁLOGO DE OFERTAS */}
      {activeTab === 'catalogo' && (
        <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 animate-fadeIn">
          {filteredOffers.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <div className="bg-card text-card-foreground border border-border p-3.5">
                <div className="py-10 text-center font-mono text-xs text-muted-foreground">
                  {searchQuery
                    ? `No se encontraron ofertas coincidentes con «${searchQuery}».`
                    : 'Sin ofertas registradas para este tenant todavía.'}
                </div>
              </div>
            </div>
          ) : (
            filteredOffers.map((o) => {
              const segmentName = typeof o.segment === 'object' && o.segment ? o.segment.name : null
              return (
                <article
                  key={o.id}
                  className="flex flex-col justify-between gap-2.5 border border-border bg-card p-4 text-card-foreground group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-bold text-foreground transition group-hover:text-sky-300">
                        {o.name}
                      </strong>
                      <Badge variant={o.active ? 'success' : 'outline'} className="font-mono text-[10px]">
                        {o.active ? 'Activa' : 'Pausada'}
                      </Badge>
                    </div>
                    {o.description && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{o.description}</p>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 font-mono text-base font-black text-foreground">
                        <CircleDollarSign className="h-4 w-4 text-sky-400" />
                        {usd.format(o.price)}
                      </span>
                      {segmentName && (
                        <span className="flex items-center gap-1 border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
                          <Tag className="h-3 w-3" />
                          {segmentName}
                        </span>
                      )}
                    </div>

                    {canEdit && o.active && (
                      <div className="flex items-center justify-between border-t border-border/50 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => handleOpenQuoteBuilder(o)}
                          className="gap-1 p-0 font-mono text-[11px] font-bold text-sky-400 hover:bg-transparent hover:text-sky-300"
                        >
                          <Plus size={12} />
                          <span>Cotizar esto</span>
                        </Button>

                        <form action={toggleOfferActiveAction} className="text-right">
                          <input type="hidden" name="id" value={o.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="xs"
                            className="font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                          >
                            {o.active ? 'Pausar' : 'Activar'}
                          </Button>
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
        <div className="bg-card text-card-foreground border border-border p-3.5 !p-0 animate-fadeIn">
          {filteredQuotes.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              {searchQuery
                ? `No se encontraron cotizaciones para «${searchQuery}».`
                : 'Sin cotizaciones emitidas en este workspace aún.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-left text-xs">
                <TableHeader>
                  <TableRow className="border-b bg-background/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-background/40">
                    <TableHead className="px-4 py-2.5 font-medium">Cotización #</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">Cliente / Prospecto</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">Total (USD)</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">Estado</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">Válida Hasta</TableHead>
                    <TableHead className="px-4 py-2.5 font-medium">PDF</TableHead>
                    <TableHead className="px-4 py-2.5 text-right font-medium">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedQuotes.map((q) => {
                    const url = getPdfUrl(q)
                    const isAccepted = q.status === 'accepted'
                    return (
                      <TableRow
                        key={q.id}
                        onClick={() => setSelectedQuote(q)}
                        className="cursor-pointer transition group hover:bg-muted/50"
                      >
                        <TableCell className="px-4 py-3 font-mono font-bold text-foreground transition group-hover:text-sky-300">
                          {q.quoteNumber || `COT-#${q.id}`}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-medium text-foreground/80">
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
                                  : q.status === 'sent'
                                    ? 'warning'
                                    : 'outline'
                            }
                            className="font-mono text-[10px]"
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
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-mono text-muted-foreground">
                          {q.validUntil ? dateFmt.format(new Date(q.validUntil)) : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`/api/pdf/quote/${q.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:border-muted-foreground/40 hover:text-foreground"
                          >
                            <FileText size={10} /> PDF
                          </a>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Compartir WhatsApp */}
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => setShareQuote(q)}
                              className="gap-1 border-emerald-800/80 bg-emerald-950/80 font-mono text-[10px] text-emerald-400 hover:bg-emerald-900 hover:text-emerald-400"
                              title="Compartir por WhatsApp"
                            >
                              <MessageSquare size={11} />
                              <span>WhatsApp</span>
                            </Button>

                            {/* Convertir a Factura */}
                            {canEdit && (q.status === 'draft' || q.status === 'sent') && (
                              <Button
                                type="button"
                                size="xs"
                                disabled={isPending}
                                onClick={() => handleConvertQuote(q.id)}
                                className="gap-1 bg-indigo-600 font-mono text-[10px] font-bold uppercase text-foreground hover:bg-indigo-500"
                                title="Aprobar y generar Factura/Cobro"
                              >
                                {isPending ? <Loader2 size={11} className="animate-spin" /> : <FileCheck size={11} />}
                                <span>Facturar</span>
                              </Button>
                            )}

                            {/* Marcar Enviada si es borrador */}
                            {canEdit && q.status === 'draft' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => handleChangeStatus(q.id, 'sent')}
                                className="bg-muted font-mono text-[10px] text-foreground/80 hover:text-foreground"
                              >
                                Marcar Enviada
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground">
            <span>
              Mostrando {paginatedQuotes.length} de {filteredQuotes.length} cotizaciones
            </span>
            {totalQuotePages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={safeQuotePage <= 1}
                  onClick={() => setQuotePage((p) => Math.max(1, p - 1))}
                  className="border-border bg-muted font-mono text-[11px] text-foreground/80 hover:text-foreground"
                >
                  Anterior
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Página {safeQuotePage} de {totalQuotePages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={safeQuotePage >= totalQuotePages}
                  onClick={() => setQuotePage((p) => Math.min(totalQuotePages, p + 1))}
                  className="border-border bg-muted font-mono text-[11px] text-foreground/80 hover:text-foreground"
                >
                  Siguiente
                </Button>
              </div>
            )}
          </footer>
        </div>
      )}

      {/* DIÁLOGO: CONSTRUCTOR DE NUEVA COTIZACIÓN RÁPIDA */}
      {isCreatingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl space-y-4 border border-border bg-background p-6 font-mono text-xs text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <FileText size={16} className="text-sky-400" />
                <span>Emitir Cotización Comercial</span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                onClick={() => setIsCreatingQuote(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </Button>
            </div>

            <form action={createQuoteAction} className="space-y-4">
              <input type="hidden" name="redirectTo" value="/workspace/offers" />

              {/* Selector de Cliente o Lead */}
              <div className="space-y-3 border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Destinatario de la Cotización</span>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="radio"
                        name="custTypeRadio"
                        checked={quoteCustomerType === 'client'}
                        onChange={() => setQuoteCustomerType('client')}
                      />
                      <span>Cliente</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="radio"
                        name="custTypeRadio"
                        checked={quoteCustomerType === 'lead'}
                        onChange={() => setQuoteCustomerType('lead')}
                      />
                      <span>Lead CRM</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1">
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
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      value={recipientQuery}
                      onChange={(e) => void handleSearchRecipients(e.target.value)}
                      placeholder="Escribe para buscar destinatario en todo el CRM..."
                      className="h-8 bg-background py-1.5 pl-8 pr-8 text-xs focus-visible:border-sky-500"
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
                    className="w-full border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus-visible:border-muted-foreground/40"
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
                    className="w-full border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus-visible:border-muted-foreground/40"
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
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      name="clientName"
                      type="text"
                      placeholder="Nombre del Cliente o Empresa"
                      value={customClientName}
                      onChange={(e) => setCustomClientName(e.target.value)}
                      className="bg-background px-3 py-2 text-xs"
                      required
                    />
                    <Input
                      name="clientEmail"
                      type="email"
                      placeholder="Correo Electrónico (opcional)"
                      value={customClientEmail}
                      onChange={(e) => setCustomClientEmail(e.target.value)}
                      className="bg-background px-3 py-2 text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Detalle de Conceptos / Ofertas */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[11px] uppercase tracking-wider">Líneas de Servicios / Ofertas</span>
                  {items.length < 6 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleAddItem}
                      className="gap-1 p-0 text-[10px] font-bold text-sky-400 hover:bg-transparent hover:text-sky-300"
                    >
                      <Plus size={12} />
                      <span>Agregar Fila</span>
                    </Button>
                  )}
                </div>

                {items.map((it, idx) => (
                  <div key={idx} className="space-y-2 border border-border bg-muted/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">Ítem #{idx + 1}</span>
                      {/* Selector de oferta predefinida */}
                      <select
                        value={it.productId}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                        className="max-w-xs border border-border bg-background px-2 py-1 text-[10px] text-sky-400 focus:outline-none"
                      >
                        <option value="">(Cargar desde Catálogo de Ofertas...)</option>
                        {activeOffers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} — {usd.format(o.price)}
                          </option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Eliminar ítem"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-muted-foreground hover:text-rose-400"
                        >
                          <X size={12} />
                        </Button>
                      )}
                    </div>

                    <input
                      type="hidden"
                      name={`item${idx}_product`}
                      value={it.productId || ''}
                    />

                    <Input
                      name={`item${idx}_description`}
                      value={it.description}
                      onChange={(e) => {
                        const next = [...items]
                        next[idx].description = e.target.value
                        setItems(next)
                      }}
                      placeholder="Descripción del servicio cotizado"
                      className="w-full bg-background px-2.5 py-1.5 text-xs"
                      required
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        Cantidad
                        <Input
                          name={`item${idx}_quantity`}
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx].quantity = Math.max(1, Number(e.target.value))
                            setItems(next)
                          }}
                          className="bg-background px-2 py-1 font-mono text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        Precio Unitario (USD)
                        <Input
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
                          className="bg-background px-2 py-1 font-mono text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        Impuesto
                        <select
                          name={`item${idx}_taxRate`}
                          value={it.taxRate}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx].taxRate = Number(e.target.value)
                            setItems(next)
                          }}
                          className="border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none"
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
              <div className="flex items-center justify-between border border-border bg-muted p-3 font-mono text-xs">
                <span className="text-muted-foreground">Total Cotizado:</span>
                <div className="text-right">
                  <span className="text-lg font-black text-foreground">{usd.format(totalCalc)}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    (Subtotal {usd.format(subtotalCalc)} + IVA {usd.format(taxCalc)})
                  </span>
                </div>
              </div>

              {/* Validez y Notas */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                  Días de Validez
                  <select
                    value={quoteValidDays}
                    onChange={(e) => setQuoteValidDays(e.target.value)}
                    className="border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none"
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
                <label className="flex flex-col gap-1 text-[10px] text-muted-foreground sm:col-span-2">
                  Condiciones / Notas
                  <Input
                    name="notes"
                    type="text"
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                    className="bg-background px-2 py-1.5 text-xs"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatingQuote(false)}
                  className="bg-muted px-4 py-2 text-xs font-bold uppercase text-foreground/80 hover:text-foreground"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-sky-400 px-5 py-2 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-sky-950 hover:bg-sky-300"
                >
                  <Send size={13} />
                  <span>Emitir Cotización</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA COMPARTIR POR WHATSAPP */}
      {shareQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 border border-emerald-800/80 bg-background p-6 font-mono text-xs text-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-emerald-400">
                <MessageSquare size={16} />
                <span>Compartir Cotización por WhatsApp</span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                onClick={() => setShareQuote(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Mensaje formateado listo para enviar al cliente {shareQuote.client?.name}:
              </p>
              <textarea
                readOnly
                rows={8}
                value={generateWhatsAppText(shareQuote)}
                className="w-full select-all border border-border bg-background p-3 font-mono text-xs text-emerald-300 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCopyWhatsAppText(shareQuote)}
                className="gap-1.5 bg-muted px-3 py-1.5 text-xs font-bold text-foreground"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? '¡Copiado!' : 'Copiar Texto'}</span>
              </Button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(generateWhatsAppText(shareQuote))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-emerald-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-black shadow-lg shadow-emerald-950 transition hover:bg-emerald-400"
              >
                <Share2 size={13} />
                <span>Abrir WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DE DETALLE DE COTIZACIÓN */}
      <Sheet
        open={selectedQuote !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedQuote(null)
        }}
      >
        <SheetContent side="right" className="gap-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Ficha de Cotización
            </SheetTitle>
            <SheetDescription className="sr-only">Detalle de la cotización seleccionada</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {selectedQuote && (
              <div className="space-y-4 font-mono text-xs">
                <div className="space-y-2 border border-amber-400 border-l-2 bg-muted/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {selectedQuote.quoteNumber || `COT-#${selectedQuote.id}`}
                    </span>
                    <Badge variant={selectedQuote.status === 'accepted' ? 'success' : 'outline'} className="font-mono text-[10px]">
                      {selectedQuote.status || 'draft'}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-bold text-foreground">
                    {selectedQuote.client?.name || 'Cliente sin nombre'}
                  </h3>

                  <div className="pt-1 font-mono text-2xl font-black text-foreground">
                    {usd.format(selectedQuote.total ?? 0)}
                  </div>
                </div>

                {/* Desglose de ítems */}
                {selectedQuote.items && selectedQuote.items.length > 0 && (
                  <div className="space-y-2 border border-border bg-card p-3.5 text-card-foreground">
                    <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Conceptos Cotizados
                    </span>
                    <div className="divide-y divide-border">
                      {selectedQuote.items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2">
                          <div>
                            <p className="font-medium text-foreground">{it.description}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {it.quantity} x {usd.format(it.unitPrice)}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-foreground">
                            {usd.format(it.lineTotal || it.quantity * it.unitPrice)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between border-t border-border pt-2 font-bold text-foreground">
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
                    className="inline-flex w-full items-center justify-center gap-2 border border-border bg-muted px-4 py-2 font-bold uppercase text-sky-400 transition hover:border-muted-foreground/40 hover:text-foreground"
                  >
                    <ExternalLink size={14} />
                    <span>Ver PDF Oficial</span>
                  </a>
                )}

                {/* Acciones del Drawer — solo cotizaciones aún facturables */}
                {canEdit && (selectedQuote.status === 'draft' || selectedQuote.status === 'sent') && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        handleConvertQuote(selectedQuote.id)
                        setSelectedQuote(null)
                      }}
                      className="flex w-full items-center justify-center gap-1.5 bg-indigo-600 py-2 font-bold uppercase text-xs text-foreground hover:bg-indigo-500"
                    >
                      <FileCheck size={14} />
                      <span>Aprobar y Facturar (1 Clic)</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
