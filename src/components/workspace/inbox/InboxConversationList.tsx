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
}: {
  conversations: ConvListItem[] | null
  selectedId: number | null
  statusFilter: 'open' | 'pending' | 'resolved' | 'all'
  nowTs: number
  onStatusFilterChange: (status: 'open' | 'pending' | 'resolved' | 'all') => void
  onSelect: (conv: ConvListItem) => void
}) {
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram_dm' | 'web'>('all')
  const [onlyNeedsReply, setOnlyNeedsReply] = useState(false)

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
    <div className="flex h-full flex-col border border-zinc-800 bg-zinc-950">
      {/* Cabecera y Buscador */}
      <div className="flex flex-col gap-2.5 border-b border-zinc-800 p-3 bg-zinc-950/80">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider font-bold text-white">Bandeja</span>
            <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.2 text-[10px] font-mono text-zinc-300">
              {filteredConvs.length}
            </span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white">
            <input
              type="checkbox"
              checked={onlyNeedsReply}
              onChange={(e) => setOnlyNeedsReply(e.target.checked)}
              className="rounded border-zinc-700 bg-black text-white focus:ring-0 h-3 w-3"
            />
            <span>Sin responder</span>
          </label>
        </div>

        {/* Input de Búsqueda */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto, teléfono..."
            className="w-full border border-zinc-800 bg-black pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none font-sans"
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

        {/* Filtros de Canal */}
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
            { key: 'instagram_dm', label: 'Instagram', icon: Camera },
            { key: 'web', label: 'Web', icon: Globe },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setChannelFilter(key as typeof channelFilter)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded transition ${
                channelFilter === key
                  ? 'bg-zinc-800 text-white font-bold border border-zinc-600'
                  : 'text-zinc-400 hover:text-white bg-black border border-zinc-850'
              }`}
            >
              {Icon && <Icon size={10} />}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Pestañas de Estado */}
        <div className="flex border border-zinc-800 bg-black p-0.5" role="tablist">
          {(['open', 'pending', 'resolved', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => onStatusFilterChange(s)}
              className={`flex-1 py-1 text-[10px] font-mono uppercase text-center transition ${
                statusFilter === s ? 'bg-white text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Todas' : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Conversaciones */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {conversations === null ? (
          <p className="p-6 text-xs text-zinc-500 font-mono text-center">Cargando conversaciones…</p>
        ) : filteredConvs.length === 0 ? (
          <p className="p-6 text-xs text-zinc-500 font-mono text-center">
            Sin conversaciones {statusFilter === 'all' ? '' : STATUS_META[statusFilter].label.toLowerCase()}.
          </p>
        ) : (
          filteredConvs.map((conv) => {
            const isSelected = selectedId === conv.id
            const name = contactDisplayName(conv)
            const chBadge = channelBadge(conv.channel)
            const ChannelIcon = chBadge.icon
            const pr = PRIORITY_META[conv.priority ?? 'media'] ?? PRIORITY_META.media
            const windowState = computeWindowState(conv.lastInboundAt, conv.lastMessageAt, nowTs)
            const isWindowActive = (windowState.windowMinutesRemaining ?? 0) > 0

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv)}
                className={`w-full p-3 text-left transition relative flex items-start gap-2.5 ${
                  isSelected ? 'bg-zinc-900 border-l-2 border-l-white' : 'hover:bg-zinc-900/50'
                }`}
              >
                {/* Avatar con iniciales */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-zinc-800 text-[11px] font-bold text-white rounded">
                  {initialsOf(name)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <strong className="truncate text-xs font-semibold text-white">{name}</strong>
                    <span className="shrink-0 text-[10px] font-mono text-zinc-500">
                      {relativeLabel(conv.lastMessageAt, nowTs)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-zinc-400">
                    <span className="truncate">{conv.contactAddress}</span>
                    {windowState.needsReply && (
                      <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-400" title="Mensaje pendiente de respuesta" />
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[9px] font-mono ${chBadge.cls}`}
                    >
                      <ChannelIcon size={9} />
                      {chBadge.label}
                    </span>

                    <span className={`border px-1.5 py-0.5 text-[9px] font-mono uppercase ${pr.cls}`}>
                      {pr.label}
                    </span>

                    {/* Semáforo de ventana 24h */}
                    <span
                      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-mono ${
                        isWindowActive
                          ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-500'
                      }`}
                      title={isWindowActive ? 'Ventana de 24h activa' : 'Ventana de 24h expirada'}
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
