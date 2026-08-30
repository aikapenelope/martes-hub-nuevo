'use client'

/**
 * NotificationBell — dropdown de notificaciones en el header del workspace.
 * Antes `notifications` no tenía ninguna superficie en el producto (ni
 * siquiera un link a admin) — el dueño solo se enteraba de quejas/alertas
 * abriendo `/admin` directamente. Usa el endpoint ya existente
 * `/api/notifications/mark-read` de la propia colección.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CircleAlert, Info, TriangleAlert } from 'lucide-react'

interface NotificationItem {
  id: number
  title: string
  body?: string | null
  severity: 'info' | 'warning' | 'error'
  read: boolean
  createdAt: string
}

const SEVERITY_ICON = { info: Info, warning: TriangleAlert, error: CircleAlert } as const
const SEVERITY_CLS = {
  info: 'text-sky-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
} as const

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?where[read][equals]=false&limit=10&sort=-createdAt', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { docs: NotificationItem[] }
        setItems(data.docs)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const interval = setInterval(() => void load(), 60_000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function markAllRead() {
    await fetch('/api/notifications/mark-read', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await load()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={`Notificaciones${items.length > 0 ? ` (${items.length} sin leer)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
      >
        <Bell size={15} />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-red-500 px-1 text-[9px] font-bold text-white">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 border border-zinc-800 bg-zinc-950 shadow-2xl">
          <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white">Notificaciones</span>
            {items.length > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-[10px] text-zinc-400 hover:text-white font-mono">
                Marcar todas leídas
              </button>
            )}
          </header>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="p-4 text-center text-xs text-zinc-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-center text-xs text-zinc-500">Sin notificaciones sin leer.</p>
            ) : (
              items.map((n) => {
                const Icon = SEVERITY_ICON[n.severity]
                return (
                  <div key={n.id} className="flex gap-2.5 border-b border-zinc-900 px-3 py-2.5 last:border-0">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${SEVERITY_CLS[n.severity]}`} />
                    <div className="min-w-0">
                      <strong className="block text-xs text-white">{n.title}</strong>
                      {n.body && <p className="mt-0.5 text-[11px] text-zinc-400 line-clamp-2">{n.body}</p>}
                      <span className="mt-1 block text-[10px] text-zinc-600 font-mono">
                        {new Date(n.createdAt).toLocaleString('es')}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
