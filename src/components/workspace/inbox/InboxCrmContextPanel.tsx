'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Loader2,
  Sparkles,
  UserCheck,
} from 'lucide-react'

import { convertLeadInSituAction } from '@/lib/crm-pipeline-actions'
import {
  addConversationNoteAction,
  summarizeConversationWithAiAction,
  updateConversationMetaAction,
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
  onNoteAdded,
  onMetaUpdated,
  onBack,
}: {
  conversation: ConvListItem
  notes: ConversationNote[]
  team: TeamMember[]
  canEdit: boolean
  onNoteAdded?: () => void
  onMetaUpdated?: () => void
  onBack?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'crm' | 'notes'>('crm')
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
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)


  const lead = typeof conversation.lead === 'object' ? conversation.lead : null
  const client = typeof conversation.client === 'object' ? conversation.client : null

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
    <div className="flex h-full flex-col border border-zinc-800 bg-zinc-950">
      {/* Switcher de Pestañas / Barra de Navegación */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950/80 p-1 gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono text-zinc-300 hover:text-white shrink-0"
            title="Volver al chat"
          >
            <ArrowLeft size={12} />
            <span>Chat</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('crm')}
          className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider text-center transition rounded ${
            activeTab === 'crm' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Ficha CRM 360°
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-1.5 text-xs font-mono uppercase tracking-wider text-center transition rounded ${
            activeTab === 'notes' ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
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

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'crm' ? (
          <>
            {/* Contexto del Prospecto (Lead) */}
            {lead && (
              <div className="border border-zinc-800 bg-black p-3 space-y-2 rounded">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold">
                    Prospecto Vinculado
                  </span>
                  <Link
                    href={`/workspace/crm/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-white"
                    title="Ver ficha completa de lead"
                  >
                    <ExternalLink size={10} /> Ver lead
                  </Link>
                </div>

                <div>
                  <strong className="block text-xs font-bold text-white">{lead.fullName}</strong>
                  {lead.companyName && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 mt-0.5">
                      <Building2 size={10} className="text-zinc-500" /> {lead.companyName}
                    </span>
                  )}
                </div>

                {lead.estimatedValue ? (
                  <div className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-400">
                    <DollarSign size={11} /> Valor Oportunidad: ${lead.estimatedValue.toLocaleString('en-US')}
                  </div>
                ) : null}

                {/* Botón / Estado de Conversión In-Situ */}
                <div className="pt-1 border-t border-zinc-850">
                  {convertedClientId ? (
                    <Link
                      href={`/workspace/crm/clientes/${convertedClientId}`}
                      className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 hover:underline"
                    >
                      <CheckCircle2 size={12} /> Cliente #{convertedClientId} creado
                    </Link>
                  ) : canEdit ? (
                    <button
                      type="button"
                      disabled={convertingLead}
                      onClick={() => void handleConvertLead()}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-emerald-600 bg-emerald-600/90 py-1.5 text-xs font-bold uppercase tracking-wider font-mono text-black transition hover:bg-emerald-500 disabled:opacity-50"
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

            {/* Contexto del Cliente Oficial */}
            {client && (
              <div className="border border-emerald-800/60 bg-emerald-950/20 p-3 space-y-2 rounded">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                    Cliente Registrado
                  </span>
                  <Link
                    href={`/workspace/crm/clientes/${client.id}`}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300 hover:text-white"
                    title="Ver ficha de cliente"
                  >
                    <ExternalLink size={10} /> Ficha cliente
                  </Link>
                </div>

                <div>
                  <strong className="block text-xs font-bold text-white">{client.name}</strong>
                  {client.companyName && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 mt-0.5">
                      <Building2 size={10} className="text-zinc-500" /> {client.companyName}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!lead && !client && (
              <div className="border border-zinc-850 bg-zinc-900/40 p-3 rounded text-center">
                <span className="block text-xs text-zinc-400 font-mono">Sin vincular al CRM</span>
                <span className="block text-[10px] text-zinc-500 mt-0.5 font-mono">
                  {conversation.contactAddress}
                </span>
              </div>
            )}

            {/* Tarjeta de Copiloto IA */}
            <div className="border border-zinc-800 bg-black p-3 space-y-2 rounded">
              <div className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                  <Sparkles size={11} /> Copiloto IA
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={summarizingAi}
                    onClick={() => void handleSummarizeAi()}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-purple-300 hover:text-purple-200 disabled:opacity-50"
                  >
                    {summarizingAi ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Sparkles size={10} />
                    )}
                    {aiSummary ? 'Actualizar' : 'Generar'}
                  </button>
                )}
              </div>

              {aiSummary ? (
                <div className="space-y-1.5 text-xs text-zinc-300">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">Sentimiento:</span>
                    <span className="inline-block rounded border border-purple-800 bg-purple-950/60 px-1.5 py-0.2 text-[9px] font-mono uppercase text-purple-300">
                      {aiSummary.sentiment}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-200">{aiSummary.summary}</p>
                </div>
              ) : (
                <p className="text-[11px] font-mono text-zinc-500">
                  Genera una síntesis ejecutiva con sentimiento y objeciones detectadas en el chat.
                </p>
              )}
            </div>

            {/* Asignación y Metadatos de la Conversación */}
            {canEdit && (
              <div className="border border-zinc-800 bg-black p-3 space-y-3 rounded">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
                  Gestión del Chat
                </span>

                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase text-zinc-400">
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
                    className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white rounded font-sans"
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

                <label className="flex flex-col gap-1 text-[10px] font-mono uppercase text-zinc-400">
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
                    className="border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white rounded font-sans"
                  />
                </label>

                {/* Etiquetas */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 block">Etiquetas</span>
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
                          className={`px-2 py-0.5 text-[9px] font-mono rounded transition disabled:opacity-40 ${
                            active
                              ? 'bg-sky-950 text-sky-300 border border-sky-700 font-bold'
                              : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
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
          </>
        ) : (
          /* Pestaña de Notas Internas Privadas */
          <div className="space-y-3">
            {canEdit && (
              <div className="space-y-2 border border-zinc-800 bg-black p-3 rounded">
                <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold block">
                  Nueva Nota Privada
                </span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Contexto interno para el equipo (no visible para el contacto)..."
                  rows={3}
                  className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none font-sans rounded resize-none"
                />
                <button
                  type="button"
                  disabled={savingNote || !noteDraft.trim()}
                  onClick={() => void handleAddNote()}
                  className="inline-flex items-center gap-1 rounded border border-white bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider font-mono text-black transition hover:bg-zinc-200 disabled:opacity-50"
                >
                  {savingNote ? <Loader2 size={11} className="animate-spin" /> : null}
                  Guardar Nota
                </button>
              </div>
            )}

            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-center text-xs font-mono text-zinc-500 py-6">
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
                      className="border-l-2 border-amber-500 bg-zinc-900/60 p-2.5 rounded-r text-xs space-y-1"
                    >
                      <p className="whitespace-pre-wrap text-zinc-200">{n.body}</p>
                      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                        <span>{authorName}</span>
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
