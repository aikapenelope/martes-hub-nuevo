'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CheckSquare2,
  CreditCard,
  ExternalLink,
  Gauge,
  Inbox,
  Megaphone,
  UsersRound,
} from 'lucide-react'

const navItems = [
  { label: 'Resumen', href: '/overview', icon: Gauge },
  { label: 'CRM', href: '/crm', icon: UsersRound },
  { label: 'Tareas', href: '/tasks', icon: CheckSquare2 },
  { label: 'Inbox', href: '/inbox', icon: Inbox },
  { label: 'Social', href: '/social', icon: Megaphone },
  { label: 'Facturación', href: '/billing', icon: CreditCard },
  { label: 'Analíticas', href: '/analytics', icon: BarChart3 },
]

interface WorkspaceSidebarProps {
  isOpen: boolean
  onNavigate: () => void
  isAdmin: boolean
}

export function WorkspaceSidebar({ isOpen, onNavigate, isAdmin }: WorkspaceSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="workspace-sidebar" data-open={isOpen} aria-label="Navegación principal">
      <Link className="workspace-brand" href="/overview" onClick={onNavigate}>
        <span className="workspace-brand-mark" aria-hidden="true">M</span>
        <span className="workspace-brand-copy"><strong>Martes Hub</strong><span>Centro de operaciones</span></span>
      </Link>
      <div className="workspace-nav-label">Workspace</div>
      <nav className="workspace-nav">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link key={href} className="workspace-nav-link" data-active={active} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
      {isAdmin ? (
        <div className="workspace-admin-link">
          <Link className="workspace-nav-link" href="/admin" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={18} aria-hidden="true" /><span>Payload Admin</span>
          </Link>
        </div>
      ) : null}
    </aside>
  )
}
