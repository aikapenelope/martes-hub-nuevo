/**
 * Configuración de navegación del workspace — única fuente de verdad para el
 * sidebar (shadcn) y los breadcrumbs del header. Movida desde
 * `WorkspaceSidebar.tsx` para que el shell efferd y el nav legacy usen los
 * mismos ítems.
 */
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileCode,
  FileText,
  Gift,
  History,
  Image as ImageIcon,
  Inbox,
  Kanban,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Pencil,
  Receipt,
  RefreshCw,
  Settings,
  Share2,
  Siren,
  StickyNote,
  Sun,
  Tags,
  Target,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Solo marcar activo con match exacto (ej. /workspace es el Resumen). */
  exact?: boolean
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
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

/** Item activo para una ruta: match exacto, o prefijo (subrutas heredan). */
export function isActiveNavItem(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** El item de navegación activo para la ruta actual (el match más largo gana). */
export function findActiveNavItem(pathname: string): NavItem | null {
  let best: NavItem | null = null
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (!isActiveNavItem(pathname, item)) continue
      if (!best || item.href.length > best.href.length) best = item
    }
  }
  return best
}
