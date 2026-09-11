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
  Flame,
  GripVertical,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Snowflake,
  Timer,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CrmLeadDrawer } from '@/components/workspace/CrmLeadDrawer'
import { CrmSlideOverDrawer } from '@/components/workspace/crm/CrmSlideOverDrawer'
import { changeLeadStageAction, convertLeadInSituAction } from '@/lib/crm-pipeline-actions'
import type { PipelineCard, PipelineColumn } from '@/lib/crm-pipeline-data'
import type { LeadStatus } from '@/lib/crm-filters'
import type { DealTemperature } from '@/lib/crm-pipeline-window'
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
  'sin-datos': 'bg-muted/80 text-muted-foreground border-border',
  verde: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  ambar: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  rojo: 'bg-destructive/10 text-destructive border-destructive/20',
}

const WINDOW_TONE_LABEL: Record<WindowTone, string> = {
  'sin-datos': 'Sin conversación',
  verde: 'Ventana activa',
  ambar: 'Ventana por vencer',
  rojo: 'Ventana expirada',
}

const VELOCITY_BORDER: Record<DealTemperature, string> = {
  hot: 'border-l-[3px] border-l-emerald-500',
  warm: 'border-l-[3px] border-l-amber-500',
  cold: 'border-l-[3px] border-l-rose-500',
}

const VELOCITY_CLASS: Record<DealTemperature, string> = {
  hot: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  warm: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  cold: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
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
      className={`rounded-lg border bg-card p-3.5 text-left transition-all duration-150 relative group shadow-xs ${
        canEdit ? 'cursor-grab active:cursor-grabbing hover:border-foreground/30 hover:shadow-sm' : 'cursor-pointer'
      } ${
        selected ? 'ring-2 ring-primary border-primary' : 'border-border'
      } ${
        card.velocity ? VELOCITY_BORDER[card.velocity.temperature] : ''
      } ${
        isBeingDragged
          ? 'opacity-30 scale-[0.97] border-primary shadow-[0_0_15px_rgba(56,189,248,0.3)]'
          : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        {canEdit && (
          <span
            className="mt-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0"
            title="Arrastra para mover de columna"
          >
            <GripVertical size={13} />
          </span>
        )}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-foreground">
          {initialsOf(card.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-semibold text-foreground">{card.fullName}</strong>
          {card.companyName && (
            <span className="flex items-center gap-1 truncate text-[10px] font-medium text-muted-foreground">
              <Building2 size={10} className="shrink-0 text-muted-foreground" />
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
            <span className="block text-[10px] font-mono text-muted-foreground">Sin teléfono</span>
          )}
        </div>
        {showInactivityAlert && (
          <CircleAlert size={14} className="shrink-0 text-destructive" aria-label="Más de 30 minutos sin respuesta" />
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.velocity && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-medium ${VELOCITY_CLASS[card.velocity.temperature]}`}
            title={`Velocidad comercial: ${card.velocity.label}`}
          >
            {card.velocity.temperature === 'hot' && <Flame size={10} className="text-emerald-400" />}
            {card.velocity.temperature === 'warm' && <Timer size={10} className="text-amber-400" />}
            {card.velocity.temperature === 'cold' && <Snowflake size={10} className="text-rose-400" />}
            <span>{card.velocity.label}</span>
          </span>
        )}
        {card.city && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            <MapPin size={10} />
            {card.city}
          </span>
        )}
        {card.channel && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-foreground/80">
            {card.channel === 'instagram_dm' ? <Camera size={10} /> : <MessageCircle size={10} className="text-[#25d366]" />}
            {card.channel === 'instagram_dm' ? 'Instagram' : 'WhatsApp'}
          </span>
        )}
        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${WINDOW_TONE_CLASS[tone]}`}>
          {WINDOW_TONE_LABEL[tone]}
        </span>
      </div>

      {card.lastMessage && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="text-muted-foreground/80">{card.lastMessage.direction === 'inbound' ? '←' : '→'}</span> {card.lastMessage.text}
          <span className="ml-1 text-muted-foreground/60">· {card.lastMessage.relative}</span>
        </p>
      )}

      {/* Barra de acciones rápidas: WhatsApp, Email y Conversión in-situ */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          {card.phone && (
            <a
              href={`https://wa.me/${card.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="WhatsApp directo"
            >
              <MessageCircle size={11} />
            </a>
          )}
          {card.email && (
            <a
              href={`mailto:${card.email}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground hover:border-sky-500/40 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
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
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              title="Prospecto convertido a cliente oficial. Ver ficha."
            >
              <CheckCircle2 size={10} className="text-emerald-400" />
              Cliente #{card.convertedClientId}
            </Link>
          ) : canEdit ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isConverting}
              onClick={(e) => {
                e.stopPropagation()
                onConvert(card.id)
              }}
              className="h-6 gap-1 rounded-md px-2 py-0 text-[10px] font-medium text-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
              title="Convertir lead a cliente oficial in-situ"
            >
              {isConverting ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : (
                <UserCheck className="size-3 text-emerald-400" />
              )}
              Convertir
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        {card.assignedTo?.name ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
            title={`Responsable: ${card.assignedTo.name}`}
          >
            <UserRound size={9} className="text-muted-foreground" />
            {card.assignedTo.name.split(' ')[0]}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground">Martes</span>
        )}
        {card.estimatedValue ? (
          <span className="flex items-center gap-0.5 text-xs font-mono font-semibold text-emerald-400 tabular-nums">
            <DollarSign size={11} /> {card.estimatedValue.toLocaleString('en-US')}
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
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, empresa, teléfono..."
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-7 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none font-sans"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Limpiar búsqueda"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-muted-foreground" />
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none font-sans"
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

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
            <span className="text-muted-foreground">Leads:</span>
            <span className="font-semibold text-foreground tabular-nums">
              {visibleLeadsCount}
              {visibleLeadsCount !== totalLeadsCount && ` de ${totalLeadsCount}`}
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400 font-semibold tabular-nums">
            <DollarSign size={13} className="text-emerald-400" />
            <span>Pipeline:</span>
            <span>${totalPipelineValue.toLocaleString('en-US')}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive font-mono" role="alert">
          {error}
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400 font-mono" role="status">
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
              className={`flex flex-col rounded-xl border bg-card transition-all duration-150 overflow-hidden ${
                isTarget
                  ? 'ring-2 ring-primary border-primary shadow-[0_0_15px_rgba(56,189,248,0.2)]'
                  : 'border-border'
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
              <header className="flex flex-col gap-1 border-b border-border p-3.5 bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">{COLUMN_LABEL[column.status]}</h2>
                  <div className="flex items-center gap-1.5">
                    {canEdit && column.status === 'nuevo' && (
                      <CrmSlideOverDrawer
                        kind="lead"
                        variant="ghost"
                        label="+ Lead"
                        initialStatus="nuevo"
                        redirectTo="/workspace/crm?vista=pipeline"
                      />
                    )}
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono tabular-nums">
                      {column.cards.length}
                      {column.cards.length !== column.total && ` / ${column.total}`}
                    </Badge>
                  </div>
                </div>
                {columnValue > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-mono font-medium text-emerald-400 tabular-nums">
                    <DollarSign size={10} />
                    {columnValue.toLocaleString('en-US')}
                  </span>
                )}
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2.5 bg-muted/10" style={{ minHeight: '8rem' }}>
                {isTarget && (
                  <div className="border border-dashed border-primary/50 bg-primary/10 py-3 text-center text-xs font-mono uppercase tracking-wider text-primary rounded-lg transition-all animate-pulse">
                    Soltar aquí para mover a {COLUMN_LABEL[column.status]}
                  </div>
                )}
                {column.cards.length === 0 && !isTarget ? (
                  <div className="text-center py-8 text-xs text-muted-foreground font-mono">
                    Sin leads en esta columna
                  </div>
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

      <Sheet
        open={selectedCard != null}
        onOpenChange={(open) => {
          if (!open) setSelectedLeadId(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="truncate text-sm font-bold uppercase tracking-wider text-foreground">
              {selectedCard?.fullName ?? 'Ficha del lead'}
            </SheetTitle>
            <SheetDescription className="sr-only">Ficha CRM 360° del lead</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
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
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

