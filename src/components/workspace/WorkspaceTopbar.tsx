'use client'

import { Search, Menu } from 'lucide-react'
import Link from 'next/link'
import { NotificationBell } from '@/components/workspace/NotificationBell'

interface WorkspaceTopbarProps {
  tenantName: string
  userHandle: string
  userInitials: string
  isAdmin: boolean
  todayLabel: string // Ej: "lun 6 sep"
}

export function WorkspaceTopbar({
  tenantName,
  userHandle,
  userInitials,
  todayLabel,
}: WorkspaceTopbarProps) {
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-black/95 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => window.dispatchEvent(new Event('workspace:toggle-mobile-nav'))}
          className="flex items-center justify-center lg:hidden p-2 text-zinc-400 hover:text-white"
        >
          <Menu size={18} />
        </button>

        {/* Tenant name (visible en desktop, en mobile el sidebar lo muestra) */}
        <span className="hidden text-[11px] font-mono text-zinc-500 sm:block">
          {tenantName}
        </span>
      </div>
      
      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Badge HOY */}
        <Link
          href="/workspace/hoy"
          className="hidden items-center gap-1.5 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 transition hover:text-white sm:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span>Hoy · {todayLabel}</span>
        </Link>

        {/* Búsqueda ⌘K */}
        <button
          type="button"
          aria-label="Buscar (Ctrl/Cmd+K)"
          onClick={() => window.dispatchEvent(new Event('workspace:open-search'))}
          className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white transition"
        >
          <Search size={12} />
          <kbd className="hidden border border-zinc-700 bg-zinc-950 px-1 text-[9px] font-mono sm:block">⌘K</kbd>
        </button>

        {/* Notificaciones */}
        <NotificationBell />

        {/* Avatar */}
        <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900 p-1 pr-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-white text-[11px] font-extrabold text-black">
            {userInitials || 'MH'}
          </span>
          <span className="hidden text-xs font-bold text-white xl:block">{userHandle}</span>
        </div>
      </div>
    </header>
  )
}
