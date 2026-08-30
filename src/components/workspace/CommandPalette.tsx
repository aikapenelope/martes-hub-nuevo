'use client'

/**
 * CommandPalette — Cmd/Ctrl+K en cualquier página del workspace. Búsqueda
 * global sobre `/api/workspace-search` (leads/clientes/tareas) más
 * navegación rápida estática a cada sección — para no tener que usar el
 * mouse para moverse por el producto.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  Calendar,
  FileText,
  Inbox,
  RefreshCw,
  Search,
  Share2,
  Users,
  Wallet,
} from 'lucide-react'

interface SearchResult {
  type: 'lead' | 'client' | 'task'
  id: number
  label: string
  sublabel: string
  href: string
}

const QUICK_NAV = [
  { label: 'Resumen', href: '/workspace', icon: BarChart3 },
  { label: 'CRM', href: '/workspace/crm', icon: Users },
  { label: 'Tareas', href: '/workspace/tasks', icon: FileText },
  { label: 'Hoy', href: '/workspace/hoy', icon: Calendar },
  { label: 'Inbox', href: '/workspace/inbox', icon: Inbox },
  { label: 'Social', href: '/workspace/social', icon: Share2 },
  { label: 'Facturación', href: '/workspace/billing', icon: Wallet },
  { label: 'Membresías', href: '/workspace/memberships', icon: RefreshCw },
]

const TYPE_LABEL = { lead: 'Lead', client: 'Cliente', task: 'Tarea' } as const

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        close()
      }
    }
    function onOpenRequest() {
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('workspace:open-search', onOpenRequest)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('workspace:open-search', onOpenRequest)
    }
  }, [open, close])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([])
      return
    }
    const t = setTimeout(() => {
      void fetch(`/api/workspace-search?q=${encodeURIComponent(query)}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results: SearchResult[] }) => {
          setResults(data.results)
          setActiveIndex(0)
        })
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const items = query.trim().length >= 2
    ? results.map((r) => ({ label: r.label, sublabel: `${TYPE_LABEL[r.type]} · ${r.sublabel}`, href: r.href, icon: Search }))
    : QUICK_NAV.map((n) => ({ label: n.label, sublabel: 'Ir a sección', href: n.href, icon: n.icon }))

  function go(href: string) {
    close()
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 pt-[15vh]" onClick={close}>
      <div
        className="w-full max-w-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min(i + 1, items.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && items[activeIndex]) {
            e.preventDefault()
            go(items[activeIndex].href)
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar leads, clientes, tareas… o navegar"
            className="w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="shrink-0 border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-center text-xs text-zinc-500">Sin resultados para &quot;{query}&quot;.</p>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.href}-${item.label}`}
                type="button"
                onClick={() => go(item.href)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i === activeIndex ? 'bg-zinc-900' : ''}`}
              >
                <item.icon className="h-4 w-4 shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-white">{item.label}</div>
                  <div className="truncate text-[10px] text-zinc-500 font-mono">{item.sublabel}</div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500 font-mono">
          <span className="inline-flex items-center gap-1"><Bell size={10} /> ↑↓ navegar · Enter abrir</span>
          <span>Ctrl/Cmd+K</span>
        </div>
      </div>
    </div>
  )
}
