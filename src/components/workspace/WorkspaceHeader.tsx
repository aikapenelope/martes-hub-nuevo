'use client'

/**
 * WorkspaceHeader — barra de navegación superior del workspace, estilo
 * Storelink (fondo negro, mono, pills de navegación) tal como se usa en
 * AnalyticsView. Es el shell compartido por todas las páginas de `/workspace`.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Resumen', href: '/workspace' },
  { label: 'CRM', href: '/workspace/crm' },
  { label: 'Tareas', href: '/workspace/tasks' },
  { label: 'Hoy', href: '/workspace/hoy' },
  { label: 'Inbox', href: '/workspace/inbox' },
  { label: 'Social', href: '/workspace/social' },
  { label: 'Facturación', href: '/workspace/billing' },
  { label: 'Analíticas', href: '/workspace/analytics' },
] as const

interface WorkspaceHeaderProps {
  tenantName: string
  userHandle: string
  userInitials: string
  isAdmin: boolean
}

export function WorkspaceHeader({ tenantName, userHandle, userInitials, isAdmin }: WorkspaceHeaderProps) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 xl:px-8">
        {/* Logo */}
        <Link href="/workspace" className="flex shrink-0 items-center gap-3">
          <span className="flex flex-col gap-1 w-5">
            <span className="h-0.5 w-full bg-white" />
            <span className="h-0.5 w-3.5 bg-zinc-400 ml-1" />
            <span className="h-0.5 w-2 bg-zinc-600 ml-2" />
          </span>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-white uppercase font-mono">
              Martes Hub
            </span>
            <span className="text-[11px] font-mono text-zinc-400 border-l border-zinc-800 pl-2">
              {tenantName}
            </span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="order-3 flex w-full overflow-x-auto border border-zinc-800 bg-zinc-950 p-0.5 lg:order-none lg:mx-auto lg:w-auto">
          {NAV_ITEMS.map(({ label, href }) => {
            const active = pathname === href || (href !== '/workspace' && pathname.startsWith(`${href}/`))
            return (
              <Link
                key={href}
                href={href}
                className={
                  active
                    ? 'shrink-0 px-3.5 py-1 text-xs font-bold bg-white text-black uppercase tracking-wider'
                    : 'shrink-0 px-3.5 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 uppercase tracking-wider transition'
                }
              >
                {label}
              </Link>
            )
          })}
          {isAdmin && (
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-3.5 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 uppercase tracking-wider transition inline-flex items-center gap-1"
            >
              Admin <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </nav>

        {/* User chip */}
        <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900 p-1 pr-3">
          <span className="w-6 h-6 bg-white text-black font-extrabold text-xs flex items-center justify-center shrink-0">
            {userInitials || 'MH'}
          </span>
          <span className="hidden text-left xl:block">
            <span className="block text-xs font-bold text-white leading-tight">{userHandle}</span>
            <span className="block text-[9px] text-zinc-400 font-mono">
              {isAdmin ? 'ADMIN' : 'AGENTE'}
            </span>
          </span>
        </div>
      </div>
    </header>
  )
}
