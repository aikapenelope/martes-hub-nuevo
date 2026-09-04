'use client'

/**
 * CrmPipelineWorkspace — tablero Kanban del Pipeline de Ventas
 * Conversacional 360° (`/workspace/crm?vista=pipeline`). Drag-and-drop
 * nativo HTML5 (sin dependencia nueva) entre columnas de `status`,
 * actualización optimista con rollback si `changeLeadStageAction` falla,
 * y clic en tarjeta para abrir la ficha 360 (drawer).
 *
 * Todos los campos derivados de tiempo (ventana 24h, "hace X min") ya
 * vienen calculados desde el servidor en `crm-pipeline-data.ts` — este
 * componente cliente nunca llama a `Date.now()`/`new Date()` en render.
 */

import { useMemo, useState, useTransition, type DragEvent } from 'react'
import Link from 'next/link'
import {
  Building2,
  Camera,
  CheckCircle2,
  CircleAlert,
  DollarSign,
  Filter,
  GripVertical,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react'

import { EmptyState } from '@/components/workspace/ui'
import { Drawer } from '@/components/workspace/overlays'
import { CrmLeadDrawer } from '@/components/workspace/CrmLeadDrawer'
import { changeLeadStageAction, convertLeadInSituAction } from '@/lib/crm-pipeline-actions'
import type { PipelineCard, PipelineColumn } from '@/lib/crm-pipeline-data'
import type { LeadStatus } from '@/lib/crm-filters'
import type { Segment, User } from '@/payload-types'

const COLUMN_LABEL: Record<LeadStatus, string> = {
  nuevo: 'Nuevos / Sin contactar',
  contactado: 'En conversación',
  calificado: 'Calificados / Oportunidad',
  descartado: 'Descartados',
}

type WindowTone = 'sin-datos' | 'verde' | 'ambar' | 'rojo'

function windowTone(minutes: number | null): WindowTone {
  if (minutes === null) return 'sin-datos'
  if (minutes <= 0) return 'rojo'
  if (minutes <= 120) return 'ambar'
  return 'verde'
}

const WINDOW_TONE_CLASS: Record<WindowTone, string> = {
  'sin-datos': 'bg-zinc-800 text-zinc-400 border-zinc-700',
  verde: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  ambar: 'bg-amber-900/50 text-amber-300 border-amber-800',
  rojo: 'bg-red-900/50 text-red-400 border-red-800',
}

const WINDOW_TONE_LABEL: Record<WindowTone, string> = {
  'sin-datos': 'Sin conversación',
  verde: 'Ventana activa',
  ambar: 'Ventana por vencer',
  rojo: 'Ventana expirada',
}

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

function PipelineCardView({
  card,
  selected,
  canEdit,
  isBeingDragged = false,
  isConverting = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onConvert,
}: {
  card: PipelineCard
  selected: boolean
  canEdit: boolean
  isBeingDragged?: boolean
  isConverting?: boolean
  onSelect: () => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd?: () => void
  onConvert: (leadId: number) => void
}) {
  const tone = windowTone(card.windowMinutesRemaining)
  const showInactivityAlert = card.needsReply && (card.minutesSinceLastInbound ?? 0) > 30

  return (
    <article
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      aria-pressed={selected}
      className={`border bg-zinc-950 p-3 text-left transition-all duration-150 relative group ${
        canEdit ? 'cursor-grab active:cursor-grabbing hover:border-zinc-700' : 'cursor-pointer'
      } ${
        selected ? 'border-white' : 'border-zinc-800'
      } ${
        isBeingDragged
          ? 'opacity-30 scale-[0.97] border-sky-400/80 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
          : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {canEdit && (
          <span
            className="mt-1 text-zinc-600 group-hover:text-zinc-400 transition shrink-0"
            title="Arrastra para mover de columna"
          >
            <GripVertical size={13} />
          </span>
        )}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-800 text-[10px] font-bold text-white">
          {initialsOf(card.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-semibold text-white">{card.fullName}</strong>
          {card.companyName && (
            <span className="flex items-center gap-1 truncate text-[10px] font-medium text-zinc-400">
              <Building2 size={10} className="shrink-0 text-zinc-500" />
              {card.companyName}
            </span>
          )}
          {card.phone ? (
            <a
              href={`https://wa.me/${card.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline"
              title="Abrir WhatsApp directo"
            >
              <MessageCircle size={10} className="text-[#25d366]" />
              <span>{card.phone}</span>
            </a>
          ) : (
            <span className="block text-[10px] font-mono text-zinc-600">Sin teléfono</span>
          )}
        </div>
        {showInactivityAlert && (
          <CircleAlert size={14} className="shrink-0 text-red-400" aria-label="Más de 30 minutos sin respuesta" />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.city && (
          <span className="inline-flex items-center gap-1 border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400">
            <MapPin size={9} />
            {card.city}
          </span>
        )}
        {card.channel && (
          <span className="inline-flex items-center gap-1 border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300">
            {card.channel === 'instagram_dm' ? <Camera size={10} /> : <MessageCircle size={10} className="text-[#25d366]" />}
            {card.channel === 'instagram_dm' ? 'Instagram' : 'WhatsApp'}
          </span>
        )}
        <span className={`inline-flex items-center border px-1.5 py-0.5 text-[9px] font-mono ${WINDOW_TONE_CLASS[tone]}`}>
          {WINDOW_TONE_LABEL[tone]}
        </span>
      </div>

      {card.lastMessage && (
        <p className="mt-2 line-clamp-2 text-[11px] text-zinc-400">
          <span className="text-zinc-500">{card.lastMessage.direction === 'inbound' ? '←' : '→'}</span> {card.lastMessage.text}
          <span className="ml-1 text-zinc-600">· {card.lastMessage.relative}</span>
        </p>
      )}

      {/* Barra de acciones rápidas: WhatsApp, Email y Conversión in-situ */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-800/80 pt-2">
        <div className="flex items-center gap-1">
          {card.phone && (
            <a
              href={`https://wa.me/${card.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-emerald-600 hover:text-[#25d366] hover:bg-zinc-850 transition"
              title="WhatsApp directo"
            >
              <MessageCircle size={11} />
            </a>
          )}
          {card.email && (
            <a
              href={`mailto:${card.email}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-sky-600 hover:text-sky-300 hover:bg-zinc-850 transition"
              title={`Escribir a ${card.email}`}
            >
              <Mail size={11} />
            </a>
          )}
        </div>

        <div>
          {card.convertedClientId ? (
            <Link
              href={`/workspace/crm/clientes/${card.convertedClientId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded border border-emerald-800/60 bg-emerald-950/60 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-300 hover:bg-emerald-900/60 hover:border-emerald-600 transition"
              title="Prospecto convertido a cliente oficial. Ver ficha."
            >
              <CheckCircle2 size={10} className="text-emerald-400" />
              Cliente #{card.convertedClientId}
            </Link>
          ) : canEdit ? (
            <button
              type="button"
              disabled={isConverting}
              onClick={(e) => {
                e.stopPropagation()
                onConvert(card.id)
              }}
              className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[9px] font-mono font-medium text-zinc-300 hover:border-emerald-600 hover:text-emerald-300 hover:bg-emerald-950/40 transition disabled:opacity-50"
              title="Convertir lead a cliente oficial in-situ"
            >
              {isConverting ? (
                <Loader2 size={10} className="animate-spin text-zinc-400" />
              ) : (
                <UserCheck size={10} className="text-emerald-400" />
              )}
              Convertir
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-850 pt-2">
        {card.assignedTo?.name ? (
          <span
            className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300"
            title={`Responsable: ${card.assignedTo.name}`}
          >
            <UserRound size={9} className="text-zinc-400" />
            {card.assignedTo.name.split(' ')[0]}
          </span>
        ) : (
          <span className="text-[9px] font-mono text-zinc-500">Martes</span>
        )}
        {card.estimatedValue ? (
          <span className="flex items-center gap-0.5 text-[10px] font-mono font-bold text-emerald-400">
            <DollarSign size={10} /> {card.estimatedValue.toLocaleString('en-US')}
          </span>
        ) : null}
      </div>
    </article>
  )
}

export function CrmPipelineWorkspace({
  columns: initialColumns,
  canEdit,
  assignees,
  segments,
}: {
  columns: PipelineColumn[]
  canEdit: boolean
  assignees: User[]
  segments: Segment[]
}) {
  const [columns, setColumns] = useState(initialColumns)
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null)
  const [draggingLeadId, setDraggingLeadId] = useState<number | null>(null)
  const [convertingLeadId, setConvertingLeadId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Filtrado reactivo en memoria sobre las tarjetas del pipeline
  const filteredColumns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return columns.map((column) => {
      const matchingCards = column.cards.filter((card) => {
        if (agentFilter !== 'all') {
          if (agentFilter === 'unassigned' && card.assignedTo) return false
          if (agentFilter !== 'unassigned' && String(card.assignedTo?.id) !== agentFilter) return false
        }
        if (!q) return true
        return (
          card.fullName.toLowerCase().includes(q) ||
          (card.companyName && card.companyName.toLowerCase().includes(q)) ||
          (card.phone && card.phone.includes(q)) ||
          (card.email && card.email.toLowerCase().includes(q)) ||
          (card.city && card.city.toLowerCase().includes(q))
        )
      })
      return {
        ...column,
        cards: matchingCards,
      }
    })
  }, [columns, searchQuery, agentFilter])

  const totalLeadsCount = useMemo(
    () => columns.reduce((acc, col) => acc + col.cards.length, 0),
    [columns],
  )
  const visibleLeadsCount = useMemo(
    () => filteredColumns.reduce((acc, col) => acc + col.cards.length, 0),
    [filteredColumns],
  )
  const totalPipelineValue = useMemo(
    () => filteredColumns.flatMap((c) => c.cards).reduce((sum, c) => sum + (c.estimatedValue || 0), 0),
    [filteredColumns],
  )

  function moveCard(leadId: number, newStatus: LeadStatus): void {
    if (!canEdit) return
    setError(null)
    setFeedback(null)
    setDragOverStatus(null)
    setDraggingLeadId(null)
    const previousColumns = columns

    let moved: PipelineCard | undefined
    const withoutCard = columns.map((column) => {
      const found = column.cards.find((card) => card.id === leadId)
      if (found) moved = found
      return { ...column, cards: column.cards.filter((card) => card.id !== leadId) }
    })
    if (!moved || moved.status === newStatus) return

    const updatedCard = { ...moved, status: newStatus }
    const nextColumns = withoutCard.map((column) =>
      column.status === newStatus
        ? { ...column, cards: [updatedCard, ...column.cards], total: column.cards.length + 1 }
        : { ...column, total: column.cards.length },
    )
    setColumns(nextColumns)

    startTransition(() => {
      void changeLeadStageAction(leadId, newStatus).then((result) => {
        if (!result.ok) {
          setError(result.error)
          setColumns(previousColumns)
        }
      })
    })
  }

  async function handleConvertInSitu(leadId: number): Promise<void> {
    if (!canEdit || convertingLeadId) return
    setConvertingLeadId(leadId)
    setError(null)
    setFeedback(null)

    try {
      const res = await convertLeadInSituAction(leadId)
      if (!res.ok) {
        setError(res.error)
        return
      }

      // Actualización reactiva in-situ: enlazar cliente y mover a calificado
      setColumns((prev) => {
        let targetCard: PipelineCard | null = null
        for (const col of prev) {
          const found = col.cards.find((c) => c.id === leadId)
          if (found) {
            targetCard = { ...found, convertedClientId: res.clientId, status: 'calificado' }
            break
          }
        }
        if (!targetCard) return prev

        return prev.map((col) => {
          const remaining = col.cards.filter((c) => c.id !== leadId)
          if (col.status === 'calificado') {
            return {
              ...col,
              cards: [targetCard!, ...remaining],
              total: remaining.length + 1,
            }
          }
          return {
            ...col,
            cards: remaining,
            total: remaining.length,
          }
        })
      })

      setFeedback(`Prospecto convertido a Cliente #${res.clientId} exitosamente.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al convertir el prospecto')
    } finally {
      setConvertingLeadId(null)
    }
  }

  const selectedCard = columns.flatMap((column) => column.cards).find((card) => card.id === selectedLeadId)

  return (
    <>
      {/* Barra de Filtros Reactivos, Búsqueda y Totales Monetarios */}
      <div className="flex flex-col gap-3 border border-zinc-800 bg-zinc-950 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, empresa, teléfono..."
              className="w-full border border-zinc-800 bg-black pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                title="Limpiar búsqueda"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-zinc-500" />
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none font-mono"
            >
              <option value="all">Todos los agentes</option>
              <option value="unassigned">Sin asignar (Martes)</option>
              {assignees.map((agent) => {
                const name = [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email
                return (
                  <option key={agent.id} value={String(agent.id)}>
                    {name}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/80 pt-2 sm:border-t-0 sm:pt-0">
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
            <span className="text-zinc-500">Leads:</span>
            <span className="font-bold text-white">
              {visibleLeadsCount}
              {visibleLeadsCount !== totalLeadsCount && ` de ${totalLeadsCount}`}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded border border-emerald-900/60 bg-emerald-950/40 px-2 py-1 text-[11px] font-mono text-emerald-300">
            <DollarSign size={12} className="text-emerald-400" />
            <span>Valor Pipeline:</span>
            <span className="font-bold text-emerald-300">
              ${totalPipelineValue.toLocaleString('en-US')}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300 font-mono" role="alert">
          {error}
        </div>
      )}

      {feedback && (
        <div className="border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 font-mono" role="status">
          {feedback}
        </div>
      )}

      <section className="grid gap-3 lg:grid-cols-4" aria-label="Pipeline de ventas Kanban">
        {filteredColumns.map((column) => {
          const isTarget = dragOverStatus === column.status
          const columnValue = column.cards.reduce((sum, c) => sum + (c.estimatedValue || 0), 0)

          return (
            <section
              key={column.status}
              className={`flex flex-col border bg-zinc-950 transition-all duration-150 ${
                isTarget
                  ? 'kanban-column-drop-active shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/50'
                  : 'border-zinc-800'
              }`}
              onDragOver={(event) => {
                if (canEdit) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dragOverStatus !== column.status) setDragOverStatus(column.status)
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  if (dragOverStatus === column.status) setDragOverStatus(null)
                }
              }}
              onDrop={(event) => {
                if (!canEdit) return
                event.preventDefault()
                setDragOverStatus(null)
                setDraggingLeadId(null)
                const leadId = Number(event.dataTransfer.getData('text/plain'))
                if (Number.isInteger(leadId) && leadId > 0) moveCard(leadId, column.status)
              }}
            >
              <header className="flex flex-col gap-1 border-b border-zinc-800 p-3 bg-zinc-950/60">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-white">{COLUMN_LABEL[column.status]}</h2>
                  <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                    {column.cards.length}
                    {column.cards.length !== column.total && ` / ${column.total}`}
                  </span>
                </div>
                {columnValue > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-mono font-medium text-emerald-400/90">
                    <DollarSign size={10} />
                    {columnValue.toLocaleString('en-US')}
                  </span>
                )}
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2" style={{ minHeight: '8rem' }}>
                {isTarget && (
                  <div className="border border-dashed border-sky-400/60 bg-sky-950/20 py-3 text-center text-[10px] font-mono uppercase tracking-wider text-sky-300 rounded transition-all animate-pulse">
                    Soltar aquí para mover a {COLUMN_LABEL[column.status]}
                  </div>
                )}
                {column.cards.length === 0 && !isTarget ? (
                  <EmptyState>Sin leads en esta columna</EmptyState>
                ) : (
                  column.cards.map((card) => (
                    <PipelineCardView
                      key={card.id}
                      card={card}
                      canEdit={canEdit}
                      selected={card.id === selectedLeadId}
                      isBeingDragged={draggingLeadId === card.id}
                      isConverting={convertingLeadId === card.id}
                      onSelect={() => setSelectedLeadId(card.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', String(card.id))
                        event.dataTransfer.effectAllowed = 'move'
                        setDraggingLeadId(card.id)
                      }}
                      onDragEnd={() => {
                        setDraggingLeadId(null)
                        setDragOverStatus(null)
                      }}
                      onConvert={handleConvertInSitu}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </section>

      <Drawer
        open={selectedCard != null}
        onClose={() => setSelectedLeadId(null)}
        title={selectedCard?.fullName ?? 'Ficha del lead'}
      >
        {selectedCard ? (
          <CrmLeadDrawer
            key={selectedCard.id}
            leadId={selectedCard.id}
            canEdit={canEdit}
            assignees={assignees}
            segments={segments}
            onUpdated={() => {
              // Si el drawer actualiza el lead, sincronizamos
            }}
          />
        ) : null}
      </Drawer>
    </>
  )
}

