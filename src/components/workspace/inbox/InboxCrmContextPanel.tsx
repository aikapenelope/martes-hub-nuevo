'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react'

import { convertLeadInSituAction } from '@/lib/crm-pipeline-actions'
import {
  addConversationNoteAction,
  getClientBillingSummaryAction,
  linkConversationToCrmAction,
  searchInboxCrmContactsAction,
  summarizeConversationWithAiAction,
  updateConversationMetaAction,
  type ClientBillingSummary,
  type ContactItem,
} from '@/lib/inbox-actions'
import type { ConvListItem } from './InboxConversationList'

const LABELS = ['seguimiento', 'facturacion', 'soporte', 'renovacion', 'urgente', 'oportunidad'] as const

export interface TeamMember {
  id: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  roles?: string[] | null
}

export interface ConversationNote {
  id: number
  body: string
  author?: { firstName?: string; lastName?: string; email?: string } | number | null
  createdAt: string
}

export function InboxCrmContextPanel({
  conversation,
  notes,
  team,
  canEdit,
  contacts = [],
  onNoteAdded,
  onMetaUpdated,
  onInsertInChat,
  onBack,
}: {
  conversation: ConvListItem
  notes: ConversationNote[]
  team: TeamMember[]
  canEdit: boolean
  contacts?: ContactItem[]
  onNoteAdded?: () => void
  onMetaUpdated?: () => void
  onInsertInChat?: (text: string) => void
  onBack?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'crm' | 'ai' | 'notes'>('crm')
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [convertingLead, setConvertingLead] = useState(false)
  const [convertedClientId, setConvertedClientId] = useState<number | null>(null)
  const [summarizingAi, setSummarizingAi] = useState(false)
  const [aiSummary, setAiSummary] = useState<{
    summary: string
    sentiment: string
    objections?: string
    nextSteps?: string
  } | null>(null)
  const [copiedAi, setCopiedAi] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Vinculación de contacto in-situ
  const [isLinkingCrm, setIsLinkingCrm] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkingPending, setLinkingPending] = useState(false)

  // Resumen de Facturación del Cliente con manejo de error explícito (revisión Devin PR #80)
  const [billingRecord, setBillingRecord] = useState<{
    clientId: number
    result: { ok: true; summary: ClientBillingSummary } | { ok: false; error: string }
  } | null>(null)

  const lead = typeof conversation.lead === 'object' ? conversation.lead : null
  const directClient = typeof conversation.client === 'object' ? conversation.client : null
  const leadConvertedClient =
    typeof lead?.convertedClient === 'object' && lead.convertedClient ? lead.convertedClient : null

  const effectiveClient = directClient || leadConvertedClient
  const effectiveClientId =
    effectiveClient?.id ||
    convertedClientId ||
    (typeof lead?.convertedClient === 'number' ? lead.convertedClient : null)
  const hasConvertedClient = Boolean(effectiveClient || effectiveClientId)

  const billingResult =
    billingRecord && billingRecord.clientId === effectiveClientId
      ? billingRecord.result
      : null
  const loadingBilling = Boolean(
    effectiveClientId && (!billingRecord || billingRecord.clientId !== effectiveClientId),
  )

  // Cargar estado de cobranzas cuando hay un cliente asociado
  useEffect(() => {
    if (!effectiveClientId) return

    let cancelled = false
    getClientBillingSummaryAction(effectiveClientId)
      .then((res) => {
        if (!cancelled) {
          setBillingRecord({ clientId: effectiveClientId, result: res })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setBillingRecord({
            clientId: effectiveClientId,
            result: {
              ok: false,
              error: err instanceof Error ? err.message : 'Error al consultar finanzas',
            },
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [effectiveClientId])

  // Búsqueda en servidor de contactos para vinculación in-situ acotada estrictamente al query activo (revisión Devin PR #80)
  const activeLinkQueryRef = useRef(linkSearch.trim())
  const [linkSearchState, setLinkSearchState] = useState<{
    query: string
    contacts: ContactItem[]
    page: number
    hasMore: boolean
    total: number | null
  } | null>(null)
  const [isSearchingLinkServer, setIsSearchingLinkServer] = useState(false)
  const [loadingMoreLink, setLoadingMoreLink] = useState(false)

  useEffect(() => {
    const q = linkSearch.trim()
    activeLinkQueryRef.current = q

    if (!q || !isLinkingCrm) return

    let cancelled = false
    const timer = setTimeout(() => {
      setIsSearchingLinkServer(true)
      searchInboxCrmContactsAction({ q, page: 1 })
        .then((res) => {
          if (!cancelled && activeLinkQueryRef.current === q) {
            setIsSearchingLinkServer(false)
            if (res.ok) {
              setLinkSearchState({
                query: q,
                contacts: res.results,
                page: 1,
                hasMore: res.hasMore,
                total: res.total,
              })
            }
          }
        })
        .catch(() => {
          if (!cancelled && activeLinkQueryRef.current === q) {
            setIsSearchingLinkServer(false)
          }
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [linkSearch, isLinkingCrm])

  const handleLoadMoreLink = () => {
    const q = activeLinkQueryRef.current
    if (!q || !linkSearchState || linkSearchState.query !== q || !linkSearchState.hasMore || loadingMoreLink) return
    const nextPage = linkSearchState.page + 1
    setLoadingMoreLink(true)
    searchInboxCrmContactsAction({ q, page: nextPage })
      .then((res) => {
        if (activeLinkQueryRef.current !== q) return
        setLoadingMoreLink(false)
        if (res.ok) {
          setLinkSearchState((prev) => {
            if (!prev || prev.query !== q) return prev
            return {
              query: q,
              contacts: [...prev.contacts, ...res.results],
              page: nextPage,
              hasMore: res.hasMore,
              total: res.total,
            }
          })
        }
      })
      .catch(() => {
        if (activeLinkQueryRef.current === q) {
          setLoadingMoreLink(false)
        }
      })
  }

  // Filtrado de contactos para vinculación in-situ acotado al query actual
  const filteredLinkContacts = useMemo(() => {
    const q = linkSearch.trim()
    if (!q) return contacts.slice(0, 10)
    if (linkSearchState && linkSearchState.query === q) return linkSearchState.contacts
    const lowerQ = q.toLowerCase()
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(lowerQ) ||
          (c.company && c.company.toLowerCase().includes(lowerQ)) ||
          (c.phone && c.phone.includes(lowerQ)),
      )
      .slice(0, 15)
  }, [contacts, linkSearch, linkSearchState])

  const linkHasMore = Boolean(linkSearchState && linkSearchState.query === linkSearch.trim() && linkSearchState.hasMore)
  const linkTotal = linkSearchState && linkSearchState.query === linkSearch.trim() ? linkSearchState.total : null

  async function handleConvertLead(): Promise<void> {
    if (!lead || !canEdit || convertingLead) return
    setConvertingLead(true)
    setError(null)
    setFeedback(null)

    const res = await convertLeadInSituAction(lead.id)
    setConvertingLead(false)
    if (!res.ok) {
      setError(res.error)
      return
    }

    setConvertedClientId(res.clientId)
    setFeedback(`¡Prospecto convertido exitosamente a Cliente #${res.clientId}!`)
    onMetaUpdated?.()
  }

  async function handleLinkContact(target: ContactItem) {
    if (!canEdit || linkingPending) return
    setLinkingPending(true)
    setError(null)
    setFeedback(null)

    const res = await linkConversationToCrmAction({
      conversationId: conversation.id,
      clientId: target.kind === 'client' ? target.id : null,
      leadId: target.kind === 'lead' ? target.id : null,
    })
    setLinkingPending(false)
    if (!res.ok) {
      setError(res.error)
    } else {
      setIsLinkingCrm(false)
      setLinkSearch('')
      setLinkSearchState(null)
      activeLinkQueryRef.current = ''
      setFeedback(`¡Conversación vinculada exitosamente a ${target.name}!`)
      onMetaUpdated?.()
    }
  }

  async function handleSummarizeAi(): Promise<void> {
    if (!canEdit || summarizingAi) return
    setSummarizingAi(true)
    setError(null)
    setFeedback(null)

    const res = await summarizeConversationWithAiAction(conversation.id)
    setSummarizingAi(false)
    if (!res.ok) {
      setError(res.error)
      return
    }

    setAiSummary({
      summary: res.summaryText,
      sentiment: res.sentiment,
    })
    setFeedback('Resumen ejecutivo de IA generado exitosamente.')
  }

  async function handleAddNote(): Promise<void> {
    const trimmed = noteDraft.trim()
    if (!trimmed || !canEdit || savingNote) return
    setSavingNote(true)
    setError(null)

    const res = await addConversationNoteAction(conversation.id, trimmed)
    setSavingNote(false)
    if (!res.ok) {
      setError(res.error)
      return
    }

    setNoteDraft('')
    onNoteAdded?.()
  }

  async function handlePatchMeta(patch: Parameters<typeof updateConversationMetaAction>[1]): Promise<void> {
    if (!canEdit || savingMeta) return
    setSavingMeta(true)
    setError(null)

    const res = await updateConversationMetaAction(conversation.id, patch)
    setSavingMeta(false)
    if (!res.ok) {
      setError(res.error)
      return
    }

    onMetaUpdated?.()
  }

  return (
    <div className="flex h-full flex-col border border-zinc-850 bg-zinc-950">
      {/* Switcher de Pestañas / Barra de Navegación 3 Pestañas */}
      <div className="flex items-center border-b border-zinc-850 bg-zinc-950/90 p-1 gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-zinc-300 hover:text-white shrink-0"
            title="Volver al chat"
          >
            <ArrowLeft size={12} />
            <span>Chat</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('crm')}
          className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider text-center transition ${
            activeTab === 'crm' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Ficha CRM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider text-center transition flex items-center justify-center gap-1 ${
            activeTab === 'ai' ? 'bg-purple-600 text-white font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Sparkles size={11} />
          <span>Copiloto</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider text-center transition ${
            activeTab === 'notes' ? 'bg-zinc-200 text-black font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Notas ({notes.length})
        </button>
      </div>

      {error && (
        <div className="m-3 border border-red-800 bg-red-900/30 p-2 text-xs text-red-300 font-mono">
          {error}
        </div>
      )}

      {feedback && (
        <div className="m-3 border border-emerald-800 bg-emerald-950/40 p-2 text-xs text-emerald-300 font-mono">
          {feedback}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
        {/* === PESTAÑA 1: FICHA CRM 360° & FINTECH === */}
        {activeTab === 'crm' && (
          <div className="space-y-3">
            {/* Prospecto Vinculado */}
            {lead && (
              <div className="border border-zinc-800 bg-black p-3 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-sky-400 font-bold">
                    Prospecto Vinculado
                  </span>
                  <Link
                    href={`/workspace/crm/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white"
                    title="Ver ficha completa de lead"
                  >
                    <ExternalLink size={10} /> Ver lead
                  </Link>
                </div>

                <div>
                  <strong className="block text-xs font-bold text-white">{lead.fullName}</strong>
                  {lead.companyName && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5">
                      <Building2 size={10} className="text-zinc-500" /> {lead.companyName}
                    </span>
                  )}
                </div>

                {lead.estimatedValue ? (
                  <div className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                    <DollarSign size={11} /> Valor Oportunidad: ${lead.estimatedValue.toLocaleString('en-US')}
                  </div>
                ) : null}

                {/* Botón / Estado de Conversión In-Situ */}
                <div className="pt-1 border-t border-zinc-850">
                  {hasConvertedClient ? (
                    <Link
                      href={`/workspace/crm/clientes/${effectiveClientId}`}
                      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                    >
                      <CheckCircle2 size={12} /> Cliente #{effectiveClientId} registrado
                    </Link>
                  ) : canEdit ? (
                    <button
                      type="button"
                      disabled={convertingLead}
                      onClick={() => void handleConvertLead()}
                      className="w-full inline-flex items-center justify-center gap-1.5 border border-emerald-600 bg-emerald-600/90 py-1.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {convertingLead ? (
                        <Loader2 size={12} className="animate-spin text-black" />
                      ) : (
                        <UserCheck size={12} />
                      )}
                      Convertir a Cliente
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* Cliente Oficial Vinculado */}
            {effectiveClient && (
              <div className="border border-emerald-800/60 bg-emerald-950/20 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                    Cliente Registrado
                  </span>
                  <Link
                    href={`/workspace/crm/clientes/${effectiveClient.id}`}
                    className="inline-flex items-center gap-1 text-[10px] text-emerald-300 hover:text-white"
                    title="Ver ficha de cliente"
                  >
                    <ExternalLink size={10} /> Ficha cliente
                  </Link>
                </div>

                <div>
                  <strong className="block text-xs font-bold text-white">
                    {effectiveClient.name || `Cliente #${effectiveClient.id}`}
                  </strong>
                  {effectiveClient.companyName && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5">
                      <Building2 size={10} className="text-zinc-500" /> {effectiveClient.companyName}
                    </span>
                  )}
                </div>

                {/* Sub-módulo Fintech: Estado de Cobros y Facturación */}
                <div className="pt-2 border-t border-emerald-900/60">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase font-bold mb-1">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CreditCard size={11} /> Estado Financiero
                    </span>
                    <Link
                      href="/workspace/billing"
                      className="text-emerald-400 hover:underline text-[9px]"
                    >
                      Ver Terminal Cobros →
                    </Link>
                  </div>

                  {loadingBilling ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 py-1">
                      <Loader2 size={10} className="animate-spin" />
                      <span>Verificando saldo pendiente...</span>
                    </div>
                  ) : billingResult ? (
                    billingResult.ok ? (
                      billingResult.summary.pendingPaymentsCount > 0 ? (
                        <div className="p-2 bg-amber-950/60 border border-amber-800 text-amber-200 text-[11px] space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span>{billingResult.summary.pendingPaymentsCount} cobro(s) pendiente(s)</span>
                            <span className="text-amber-300 font-mono">
                              ${billingResult.summary.pendingTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                            </span>
                          </div>
                          <span className="text-[9px] text-zinc-400 block">
                            El cliente tiene cuentas abiertas en facturación.
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-[10px] flex items-center gap-1.5 font-bold">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          <span>Al día · Sin cobros pendientes registrados</span>
                        </div>
                      )
                    ) : (
                      <div className="p-2 bg-zinc-900/80 border border-zinc-750 text-zinc-400 text-[10px] flex items-center justify-between">
                        <span className="flex items-center gap-1 text-zinc-300 font-medium">
                          <AlertCircle size={11} className="text-amber-400" />
                          <span>Estado financiero no disponible</span>
                        </span>
                        <span className="text-[9px] text-zinc-500 truncate max-w-[120px]" title={billingResult.error}>
                          {billingResult.error}
                        </span>
                      </div>
                    )
                  ) : null}
                </div>
              </div>
            )}

            {/* Si no está vinculado a CRM: Opción para vincular in-situ */}
            {!lead && !effectiveClient && (
              <div className="border border-zinc-850 bg-zinc-900/40 p-3 space-y-2.5">
                <div className="text-center">
                  <span className="block text-xs text-zinc-400 font-bold">Sin vincular al CRM</span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">
                    {conversation.contactAddress}
                  </span>
                </div>

                {canEdit && (
                  <div>
                    {!isLinkingCrm ? (
                      <button
                        type="button"
                        onClick={() => setIsLinkingCrm(true)}
                        className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs uppercase font-bold transition flex items-center justify-center gap-1"
                      >
                        <LinkIcon size={12} />
                        <span>Vincular a Cliente o Prospecto</span>
                      </button>
                    ) : (
                      <div className="space-y-2 p-2 bg-black border border-zinc-800">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-400 uppercase font-bold">
                            Seleccionar Contacto
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsLinkingCrm(false)
                              setLinkSearch('')
                              setLinkSearchState(null)
                              activeLinkQueryRef.current = ''
                            }}
                            className="text-zinc-500 hover:text-white"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="relative">
                          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input
                            type="text"
                            value={linkSearch}
                            onChange={(e) => setLinkSearch(e.target.value)}
                            placeholder="Buscar en clientes y leads..."
                            className="w-full bg-zinc-900 border border-zinc-800 pl-7 pr-7 py-1 text-xs text-white focus:outline-none"
                          />
                          {isSearchingLinkServer && Boolean(linkSearch.trim()) && (
                            <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" />
                          )}
                        </div>
                        <div className="max-h-36 overflow-y-auto divide-y divide-zinc-850 border border-zinc-850">
                          {filteredLinkContacts.map((c) => (
                            <button
                              key={`${c.kind}-${c.id}`}
                              type="button"
                              disabled={linkingPending}
                              onClick={() => void handleLinkContact(c)}
                              className="w-full text-left p-1.5 hover:bg-zinc-800 transition flex items-center justify-between text-[11px]"
                            >
                              <span className="text-white truncate">{c.name}</span>
                              <span className="text-[9px] text-zinc-500 uppercase">{c.kind}</span>
                            </button>
                          ))}
                          {linkHasMore && (
                            <button
                              type="button"
                              disabled={loadingMoreLink}
                              onClick={handleLoadMoreLink}
                              className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[9px] uppercase font-bold border-t border-zinc-800 flex items-center justify-center gap-1 transition"
                            >
                              {loadingMoreLink ? <Loader2 size={10} className="animate-spin" /> : null}
                              <span>
                                {loadingMoreLink
                                  ? 'Cargando...'
                                  : `Cargar más (${filteredLinkContacts.length} de ${linkTotal ?? 'más'})`}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Asignación y Metadatos de la Conversación */}
            {canEdit && (
              <div className="border border-zinc-800 bg-black p-3 space-y-3">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                  Gestión del Chat
                </span>

                <label className="flex flex-col gap-1 text-[10px] uppercase text-zinc-400">
                  Responsable Asignado
                  <select
                    value={
                      typeof conversation.assignee === 'object' && conversation.assignee
                        ? conversation.assignee.id
                        : ''
                    }
                    disabled={savingMeta}
                    onChange={(e) =>
                      void handlePatchMeta({
                        assignee: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Sin asignar (Martes)</option>
                    {team.map((u) => {
                      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
                      return (
                        <option key={u.id} value={u.id}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                </label>

                {/* Prioridad */}
                <label className="flex flex-col gap-1 text-[10px] uppercase text-zinc-400">
                  Prioridad
                  <select
                    value={conversation.priority ?? 'media'}
                    disabled={savingMeta}
                    onChange={(e) =>
                      void handlePatchMeta({
                        priority: e.target.value as 'baja' | 'media' | 'alta',
                      })
                    }
                    className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[10px] uppercase text-zinc-400">
                  Snooze (Silenciar hasta)
                  <input
                    type="datetime-local"
                    defaultValue={
                      conversation.snoozeUntil
                        ? new Date(conversation.snoozeUntil).toISOString().slice(0, 16)
                        : ''
                    }
                    disabled={savingMeta}
                    onChange={(e) =>
                      void handlePatchMeta({ snoozeUntil: e.target.value || null })
                    }
                    className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                  />
                </label>

                {/* Etiquetas */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase text-zinc-400 block font-bold">Etiquetas</span>
                  <div className="flex flex-wrap gap-1">
                    {LABELS.map((l) => {
                      const active = conversation.labels?.includes(l) ?? false
                      return (
                        <button
                          key={l}
                          type="button"
                          disabled={savingMeta}
                          onClick={() => {
                            const next = active
                              ? (conversation.labels ?? []).filter((x) => x !== l)
                              : [...(conversation.labels ?? []), l]
                            void handlePatchMeta({ labels: next as (typeof LABELS)[number][] })
                          }}
                          className={`px-2 py-0.5 text-[9px] uppercase border transition disabled:opacity-40 ${
                            active
                              ? 'bg-sky-950 text-sky-300 border-sky-700 font-bold'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === PESTAÑA 2: COPILOTO IA === */}
        {activeTab === 'ai' && (
          <div className="space-y-3">
            <div className="border border-purple-900/60 bg-purple-950/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-purple-300 font-bold">
                  <Sparkles size={13} className="text-purple-400" /> Copiloto Inteligente
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={summarizingAi}
                    onClick={() => void handleSummarizeAi()}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold uppercase transition flex items-center gap-1 disabled:opacity-50"
                  >
                    {summarizingAi ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    <span>{aiSummary ? 'Regenerar' : 'Sintetizar Chat'}</span>
                  </button>
                )}
              </div>

              {aiSummary ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 uppercase">Sentimiento Detectado:</span>
                    <span
                      className={`px-2 py-0.5 text-[9px] uppercase font-bold border ${
                        aiSummary.sentiment === 'positivo'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : aiSummary.sentiment === 'negativo' || aiSummary.sentiment === 'en_riesgo'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700'
                      }`}
                    >
                      {aiSummary.sentiment}
                    </span>
                  </div>

                  <div className="p-2.5 bg-black border border-purple-900/50 space-y-1">
                    <span className="text-[10px] text-purple-400 uppercase font-bold block">
                      Resumen Ejecutivo
                    </span>
                    <p className="text-xs text-zinc-200 leading-relaxed font-sans">{aiSummary.summary}</p>
                  </div>

                  {aiSummary.objections && (
                    <div className="p-2.5 bg-black border border-amber-900/50 space-y-1">
                      <span className="text-[10px] text-amber-400 uppercase font-bold block">
                        Objeciones o Dudas
                      </span>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{aiSummary.objections}</p>
                    </div>
                  )}

                  {aiSummary.nextSteps && (
                    <div className="p-2.5 bg-black border border-emerald-900/50 space-y-2">
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">
                        Próximo Paso Recomendado
                      </span>
                      <p className="text-xs text-zinc-200 leading-relaxed font-sans">{aiSummary.nextSteps}</p>

                      {onInsertInChat && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertInChat(aiSummary.nextSteps || aiSummary.summary)
                            setCopiedAi(true)
                            setTimeout(() => setCopiedAi(false), 2000)
                          }}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold uppercase text-[10px] transition flex items-center justify-center gap-1.5"
                        >
                          {copiedAi ? <Check size={12} /> : <MessageSquare size={12} />}
                          <span>{copiedAi ? '¡Copiado al Chat!' : 'Insertar Respuesta en Chat'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Haz clic en &quot;Sintetizar Chat&quot; para que el copiloto procese los últimos mensajes, determine el sentimiento del contacto y proponga los siguientes pasos comerciales.
                </p>
              )}
            </div>
          </div>
        )}

        {/* === PESTAÑA 3: NOTAS INTERNAS === */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            {canEdit && (
              <div className="space-y-2 border border-zinc-800 bg-black p-3">
                <span className="text-[10px] uppercase text-zinc-400 font-bold block">
                  Nueva Nota Privada
                </span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Contexto interno para el equipo (no visible para el contacto)..."
                  rows={3}
                  className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none resize-none font-sans"
                />
                <button
                  type="button"
                  disabled={savingNote || !noteDraft.trim()}
                  onClick={() => void handleAddNote()}
                  className="inline-flex items-center gap-1 border border-white bg-white hover:bg-zinc-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black transition disabled:opacity-50"
                >
                  {savingNote ? <Loader2 size={11} className="animate-spin" /> : null}
                  <span>Guardar Nota</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-center text-xs text-zinc-500 py-6">
                  Sin notas internas para esta conversación.
                </p>
              ) : (
                notes.map((n) => {
                  const authorName =
                    typeof n.author === 'object' && n.author
                      ? [n.author.firstName, n.author.lastName].filter(Boolean).join(' ') || n.author.email
                      : 'Equipo'

                  return (
                    <div
                      key={n.id}
                      className="border-l-2 border-amber-500 bg-zinc-900/60 p-2.5 text-xs space-y-1"
                    >
                      <p className="whitespace-pre-wrap text-zinc-200 font-sans">{n.body}</p>
                      <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-1">
                        <span className="font-bold text-zinc-400">{authorName}</span>
                        <span>{new Date(n.createdAt).toLocaleDateString('es-ES')}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
