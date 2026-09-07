'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileCode,
  FileText,
  Gift,
  History,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Pencil, // whiteboard icon
  RefreshCw,
  Settings,
  Share2,
  Shield,
  Siren,
  StickyNote,
  Tags,
  Users,
  LayoutDashboard,
  Kanban,
  CheckSquare,
  Sun,
  Inbox,
  Receipt,
  Target,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { label: 'Resumen', href: '/workspace', icon: LayoutDashboard, exact: true },
      { label: 'Hoy', href: '/workspace/hoy', icon: Sun },
      { label: 'CRM', href: '/workspace/crm', icon: Kanban },
      { label: 'Prospección', href: '/workspace/outreach', icon: Target },
      { label: 'Tareas', href: '/workspace/tasks', icon: CheckSquare },
      { label: 'Inbox', href: '/workspace/inbox', icon: Inbox },
      { label: 'Facturación', href: '/workspace/billing', icon: Receipt },
      { label: 'Notas', href: '/workspace/notes', icon: StickyNote },
      { label: 'Whiteboard', href: '/workspace/whiteboard', icon: Pencil },
    ],
  },
  {
    label: 'Operación',
    items: [
      { label: 'Calendario', href: '/workspace/calendar', icon: CalendarDays },
      { label: 'Social Hub', href: '/workspace/social', icon: Share2 },
      { label: 'Email', href: '/workspace/email', icon: Mail },
      { label: 'Membresías', href: '/workspace/memberships', icon: CreditCard },
      { label: 'Ofertas', href: '/workspace/offers', icon: Gift },
      { label: 'Actividades', href: '/workspace/activities', icon: History },
      { label: 'Documentos', href: '/workspace/documents', icon: FileText },
      { label: 'Media', href: '/workspace/media', icon: ImageIcon },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { label: 'Equipo', href: '/workspace/team', icon: Users },
      { label: 'Plantillas', href: '/workspace/templates', icon: FileCode },
      { label: 'Rubros', href: '/workspace/segments', icon: Tags },
      { label: 'Analíticas', href: '/workspace/analytics', icon: BarChart3 },
      { label: 'Feedback', href: '/workspace/feedback', icon: MessageSquare },
      { label: 'Incidentes', href: '/workspace/notifications', icon: Siren },
      { label: 'Automatizaciones', href: '/workspace/settings/automatizaciones', icon: RefreshCw },
      { label: 'Ajustes', href: '/workspace/settings', icon: Settings },
    ],
  },
]

interface WorkspaceSidebarProps {
  isAdmin: boolean
  // Estado inicial de colapso viene del cookie/localStorage a través del server
  defaultCollapsed?: boolean
  /** Se invoca al elegir un destino — el drawer móvil lo usa para cerrarse. */
  onNavigate?: () => void
}

export function WorkspaceSidebar({ isAdmin, defaultCollapsed = false, onNavigate }: WorkspaceSidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean): boolean {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <aside
      className={`relative flex h-full flex-col border-r border-zinc-800 bg-black transition-all duration-200 ${
        collapsed ? 'w-[52px]' : 'w-[220px]'
      }`}
    >
      {/* Toggle collapse button */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-3.5 h-14">
        <Link href="/workspace" className="flex items-center gap-2 min-w-0">
          <span className="flex flex-col gap-0.5 shrink-0 w-5">
            <span className="h-0.5 w-full bg-white" />
            <span className="h-0.5 w-3.5 bg-zinc-400 ml-1" />
            <span className="h-0.5 w-2 bg-zinc-600 ml-2" />
          </span>
          {!collapsed && (
            <span className="text-[13px] font-extrabold tracking-tight text-white uppercase font-mono truncate">
              Martes Hub
            </span>
          )}
        </Link>
      </div>

      {/* Nav groups — scrollable */}
      <nav className="flex-1 overflow-y-auto py-2 overflow-x-hidden">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="mb-1">
            {!collapsed && (
              <div className="px-3 pb-1 pt-3 text-[9px] font-mono uppercase tracking-widest text-zinc-600">
                {group.label}
              </div>
            )}
            {group.items.map(item => {
              const Icon = item.icon
              const active = isActive(item.href, item.exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white border-l-2 border-white font-bold'
                      : 'text-zinc-500 hover:text-white hover:bg-zinc-900/60 border-l-2 border-transparent'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <Icon size={15} className={`shrink-0 ${active ? 'text-white' : 'text-zinc-500'}`} />
                  {!collapsed && (
                    <span className="font-mono tracking-wide truncate">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}

        {/* Admin link */}
        {isAdmin && !collapsed && (
          <div className="mt-2 border-t border-zinc-900 pt-2">
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-900 transition font-mono"
            >
              <span className="flex items-center gap-2">
                <Shield size={14} className="text-emerald-500" />
                Payload Admin
              </span>
              <ExternalLink size={10} />
            </a>
          </div>
        )}
        {isAdmin && collapsed && (
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            title="Payload Admin"
            className="flex items-center justify-center py-1.5 text-zinc-500 hover:text-emerald-400 transition"
          >
            <Shield size={15} />
          </a>
        )}
      </nav>
    </aside>
  )
}
