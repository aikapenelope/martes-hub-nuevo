'use client'

import { useMemo, useState } from 'react'
import {
  Camera,
  Clock,
  Globe,
  MessageCircle,
  Search,
  X,
} from 'lucide-react'

import { computeWindowState, relativeLabel } from '@/lib/crm-pipeline-window'

export interface ConvListItem {
  id: number
  contactAddress: string
  channel: string
  status?: string | null
  priority?: string | null
  labels?: string[] | null
  snoozeUntil?: string | null
  lastMessageAt: string | null
  lastInboundAt: string | null
  assignee?: { id: number; firstName?: string; lastName?: string; email?: string } | number | null
  client?: { id: number; name?: string; companyName?: string | null } | number | null
  lead?: {
    id: number
    fullName?: string
    companyName?: string | null
    estimatedValue?: number | null
    convertedClient?: { id: number; name?: string; companyName?: string | null } | number | null
  } | number | null
}

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  open: { label: 'Abiertas', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  pending: { label: 'Pendientes', dot: 'bg-amber-400', text: 'text-amber-300' },
  resolved: { label: 'Resueltas', dot: 'bg-zinc-500', text: 'text-zinc-400' },
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'bg-red-950/80 text-red-300 border border-red-800' },
  media: { label: 'Media', cls: 'bg-zinc-900 text-zinc-300 border border-zinc-700' },
  baja: { label: 'Baja', cls: 'bg-zinc-900 text-zinc-400 border border-zinc-800' },
}

function channelBadge(channel: string) {
  if (channel === 'instagram_dm') {
    return {
      label: 'Instagram',
      icon: Camera,
      cls: 'bg-purple-950/60 text-purple-300 border-purple-800',
    }
  }
  if (channel === 'whatsapp_web' || channel === 'web') {
    return {
      label: 'Web',
      icon: Globe,
      cls: 'bg-sky-950/60 text-sky-300 border-sky-800',
    }
  }
  return {
    label: 'WhatsApp',
    icon: MessageCircle,
    cls: 'bg-emerald-950/60 text-[#25d366] border-emerald-800',
  }
}

function contactDisplayName(c: ConvListItem): string {
  if (typeof c.client === 'object' && c.client?.name) return c.client.name
  if (typeof c.lead === 'object' && c.lead?.fullName) return c.lead.fullName
  return c.contactAddress
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

export function InboxConversationList({
  conversations,
  selectedId,
  statusFilter,
  nowTs,
  onStatusFilterChange,
  onSelect,
  onNewConversation,
}: {
  conversations: ConvListItem[] | null
  selectedId: number | null
  statusFilter: 'open' | 'pending' | 'resolved' | 'all'
  nowTs: number
  onStatusFilterChange: (status: 'open' | 'pending' | 'resolved' | 'all') => void
  onSelect: (conv: ConvListItem) => void
  onNewConversation?: () => void
}) {
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram_dm' | 'web'>('all')
  const [onlyNeedsReply, setOnlyNeedsReply] = useState(false)

  // Métricas reactivas para la barra de filtros y canales
  const counts = useMemo(() => {
    if (!conversations) {
      return { open: 0, pending: 0, resolved: 0, all: 0, needsReply: 0, whatsapp: 0, instagram: 0, web: 0 }
    }
    let open = 0
    let pending = 0
    let resolved = 0
    let needsReply = 0
    let whatsapp = 0
    let instagram = 0
    let web = 0

    for (const c of conversations) {
      if (c.status === 'open') open++
      else if (c.status === 'pending') pending++
      else if (c.status === 'resolved') resolved++

      if (c.channel === 'whatsapp') whatsapp++
      else if (c.channel === 'instagram_dm') instagram++
      else if (c.channel === 'whatsapp_web' || c.channel === 'web') web++

      const w = computeWindowState(c.lastInboundAt, c.lastMessageAt, nowTs)
      if (w.needsReply) needsReply++
    }

    return {
      open,
      pending,
      resolved,
      all: conversations.length,
      needsReply,
      whatsapp,
      instagram,
      web,
    }
  }, [conversations, nowTs])

  // Filtrado reactivo de conversaciones
  const filteredConvs = useMemo(() => {
    if (!conversations) return []
    const q = search.trim().toLowerCase()

    return conversations.filter((c) => {
      // Filtro de canal
      if (channelFilter !== 'all') {
        if (channelFilter === 'web' && c.channel !== 'whatsapp_web' && c.channel !== 'web') return false
        if (channelFilter === 'whatsapp' && c.channel !== 'whatsapp') return false
        if (channelFilter === 'instagram_dm' && c.channel !== 'instagram_dm') return false
      }

      // Filtro solo sin responder
      if (onlyNeedsReply) {
        const windowState = computeWindowState(c.lastInboundAt, c.lastMessageAt, nowTs)
        if (!windowState.needsReply) return false
      }

      // Filtro de texto
      if (!q) return true
      const name = contactDisplayName(c).toLowerCase()
      const addr = c.contactAddress.toLowerCase()
      const company =
        (typeof c.client === 'object' && c.client?.companyName?.toLowerCase()) ||
        (typeof c.lead === 'object' && c.lead?.companyName?.toLowerCase()) ||
        ''

      return name.includes(q) || addr.includes(q) || company.includes(q)
    })
  }, [conversations, search, channelFilter, onlyNeedsReply, nowTs])

  return (
    <div className="flex h-full flex-col border border-zinc-850 bg-zinc-950">
      {/* Cabecera, Métricas y Buscador */}
      <div className="flex flex-col gap-2.5 border-b border-zinc-850 p-3 bg-zinc-950/90">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider font-bold text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Bandeja
            </span>
            <span className="px-1.5 py-0.2 bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
              {filteredConvs.length}
            </span>
            {counts.needsReply > 0 && (
              <span
                className="px-1.5 py-0.2 bg-emerald-950/80 border border-emerald-800 text-[10px] font-mono text-emerald-300 font-bold flex items-center gap-1"
                title={`${counts.needsReply} conversaciones esperando respuesta`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {counts.needsReply} por responder
              </span>
            )}
          </div>

          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              className="px-2 py-1 bg-white hover:bg-zinc-200 text-black text-[10px] font-mono font-bold uppercase transition flex items-center gap-1 shadow-xs"
              title="Iniciar nuevo hilo omnicanal"
            >
              <span>+ Nuevo</span>
            </button>
          )}
        </div>

        {/* Input de Búsqueda */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto, teléfono o empresa..."
            className="w-full border border-zinc-800 bg-black pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none font-mono"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filtros de Canal con Conteo */}
        <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
          {[
            { key: 'all', label: 'Todos', count: counts.all },
            { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, count: counts.whatsapp, activeCls: 'bg-emerald-950 text-emerald-300 border-emerald-700' },
            { key: 'instagram_dm', label: 'IG DM', icon: Camera, count: counts.instagram, activeCls: 'bg-purple-950 text-purple-300 border-purple-700' },
            { key: 'web', label: 'Web', icon: Globe, count: counts.web, activeCls: 'bg-sky-950 text-sky-300 border-sky-700' },
          ].map(({ key, label, icon: Icon, count, activeCls }) => {
            const isActive = channelFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setChannelFilter(key as typeof channelFilter)}
                className={`py-1 px-1 border text-center transition flex items-center justify-center gap-1 truncate ${
                  isActive
                    ? activeCls || 'bg-zinc-800 text-white font-bold border-zinc-600'
                    : 'bg-black text-zinc-400 hover:text-white border-zinc-850'
                }`}
              >
                {Icon && <Icon size={10} className="shrink-0" />}
                <span className="truncate">{label}</span>
                <span className="opacity-70 text-[9px]">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Pestañas de Estado & Toggle Sin Responder */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-1 border border-zinc-850 bg-black p-0.5" role="tablist">
            {(['open', 'pending', 'resolved', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={statusFilter === s}
                onClick={() => onStatusFilterChange(s)}
                className={`flex-1 py-1 text-[10px] font-mono uppercase text-center transition ${
                  statusFilter === s ? 'bg-zinc-200 text-black font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {s === 'all'
                  ? 'Todas'
                  : s === 'open'
                    ? `Abiertas (${counts.open})`
                    : s === 'pending'
                      ? `Pend. (${counts.pending})`
                      : `Res. (${counts.resolved})`}
              </button>
            ))}
          </div>

          <label
            className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white shrink-0"
            title="Mostrar únicamente chats donde el cliente envió el último mensaje"
          >
            <input
              type="checkbox"
              checked={onlyNeedsReply}
              onChange={(e) => setOnlyNeedsReply(e.target.checked)}
              className="rounded-none border-zinc-700 bg-black text-white focus:ring-0 h-3 w-3"
            />
            <span>Por responder</span>
          </label>
        </div>
      </div>

      {/* Lista de Conversaciones */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {conversations === null ? (
          <div className="p-8 text-center space-y-2">
            <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin inline-block" />
            <p className="text-xs text-zinc-500 font-mono">Cargando bandeja omnicanal…</p>
          </div>
        ) : filteredConvs.length === 0 ? (
          <div className="p-8 text-center space-y-1">
            <p className="text-xs text-zinc-400 font-mono font-bold">Sin conversaciones activas</p>
            <p className="text-[11px] text-zinc-600 font-mono">
              {search
                ? 'No hay resultados que coincidan con la búsqueda.'
                : statusFilter === 'all'
                  ? 'No hay registros en la bandeja seleccionada.'
                  : `No hay conversaciones en estado ${STATUS_META[statusFilter]?.label.toLowerCase() || statusFilter}.`}
            </p>
          </div>
        ) : (
          filteredConvs.map((conv) => {
            const isSelected = selectedId === conv.id
            const name = contactDisplayName(conv)
            const chBadge = channelBadge(conv.channel)
            const ChannelIcon = chBadge.icon
            const pr = PRIORITY_META[conv.priority ?? 'media'] ?? PRIORITY_META.media
            const windowState = computeWindowState(conv.lastInboundAt, conv.lastMessageAt, nowTs)
            const isWindowActive = (windowState.windowMinutesRemaining ?? 0) > 0

            const isClient = typeof conv.client === 'object' && conv.client !== null
            const isLead = typeof conv.lead === 'object' && conv.lead !== null

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv)}
                className={`w-full p-3 text-left transition relative flex items-start gap-2.5 font-mono ${
                  isSelected
                    ? 'bg-zinc-900 border-l-2 border-l-emerald-400 shadow-inner'
                    : 'hover:bg-zinc-900/60'
                }`}
              >
                {/* Avatar con iniciales y micro-emblema de canal */}
                <div className="relative shrink-0 mt-0.5">
                  <span className="flex h-8 w-8 items-center justify-center bg-zinc-850 border border-zinc-750 text-[11px] font-bold text-white">
                    {initialsOf(name)}
                  </span>
                  <span
                    className={`absolute -bottom-1 -right-1 p-0.5 border border-black ${
                      conv.channel === 'whatsapp'
                        ? 'bg-emerald-500 text-black'
                        : conv.channel === 'instagram_dm'
                          ? 'bg-purple-500 text-white'
                          : 'bg-sky-500 text-black'
                    }`}
                    title={chBadge.label}
                  >
                    <ChannelIcon size={9} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <strong className="truncate text-xs font-bold text-white">{name}</strong>
                      {isClient ? (
                        <span className="text-[8px] uppercase px-1 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                          Cliente
                        </span>
                      ) : isLead ? (
                        <span className="text-[8px] uppercase px-1 py-0.2 bg-sky-950 text-sky-300 border border-sky-800 shrink-0">
                          Lead
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {relativeLabel(conv.lastMessageAt, nowTs)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5 text-[10px] text-zinc-400">
                    <span className="truncate">{conv.contactAddress}</span>
                    {windowState.needsReply && (
                      <span
                        className="inline-flex items-center gap-1 text-emerald-400 text-[9px] font-bold"
                        title="Esperando respuesta del asesor"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Sin responder</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[9px] ${chBadge.cls}`}
                    >
                      <ChannelIcon size={9} />
                      {chBadge.label}
                    </span>

                    <span className={`border px-1.5 py-0.5 text-[9px] uppercase ${pr.cls}`}>
                      {pr.label}
                    </span>

                    {/* Semáforo de ventana 24h */}
                    <span
                      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] ${
                        isWindowActive
                          ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                      }`}
                      title={isWindowActive ? 'Ventana de 24h activa para envío de mensajes libres' : 'Ventana de 24h expirada (requiere plantilla de WhatsApp)'}
                    >
                      <Clock size={8} />
                      {isWindowActive ? `${windowState.windowMinutesRemaining}m` : '24h vencida'}
                    </span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
