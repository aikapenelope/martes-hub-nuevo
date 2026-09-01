'use client'

/**
 * WorkspaceHeader — barra de navegación superior del workspace, estilo
 * Storelink (fondo negro, mono, pills de navegación) con agrupación limpia
 * de módulos principales y menú de operación para evitar desbordamientos.
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FileCode,
  FileText,
  Gift,
  History,
  Image as ImageIcon,
  Mail,
  MessageSquare,
  Search,
  Share2,
  Shield,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react'

import { NotificationBell } from '@/components/workspace/NotificationBell'

const PRIMARY_NAV = [
  { label: 'Resumen', href: '/workspace' },
  { label: 'CRM', href: '/workspace/crm' },
  { label: 'Tareas', href: '/workspace/tasks' },
  { label: 'Hoy', href: '/workspace/hoy' },
  { label: 'Inbox', href: '/workspace/inbox' },
  { label: 'Facturación', href: '/workspace/billing' },
] as const

const SECONDARY_NAV = [
  { label: 'Social Hub', href: '/workspace/social', icon: Share2, description: 'Publicaciones y métricas en Meta / IG' },
  { label: 'Membresías', href: '/workspace/memberships', icon: CreditCard, description: 'Planes recurrentes y renovaciones' },
  { label: 'Ofertas', href: '/workspace/offers', icon: Gift, description: 'Catálogo comercial y precios base' },
  { label: 'Actividades', href: '/workspace/activities', icon: History, description: 'Timeline comercial unificado' },
  { label: 'Documentos', href: '/workspace/documents', icon: FileText, description: 'Cotizaciones, contratos y archivos' },
  { label: 'Media', href: '/workspace/media', icon: ImageIcon, description: 'Biblioteca de imágenes y archivos' },
  { label: 'Email Marketing', href: '/workspace/email', icon: Mail, description: 'Campañas y registros de entrega' },
  { label: 'Rubros & Nichos', href: '/workspace/segments', icon: Tags, description: 'Segmentación de cartera y prospectos' },
  { label: 'Plantillas', href: '/workspace/templates', icon: FileCode, description: 'Plantillas de WhatsApp y mensajes' },
  { label: 'Equipo Comercial', href: '/workspace/team', icon: Users, description: 'Agentes y asignaciones' },
  { label: 'Feedback & Soporte', href: '/workspace/feedback', icon: MessageSquare, description: 'Respuestas de formularios Tally' },
  { label: 'Analíticas', href: '/workspace/analytics', icon: BarChart3, description: 'Métricas de conversión y ventas' },
] as const

interface WorkspaceHeaderProps {
  tenantName: string
  userHandle: string
  userInitials: string
  isAdmin: boolean
}

export function WorkspaceHeader({ tenantName, userHandle, userInitials, isAdmin }: WorkspaceHeaderProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isSecondaryActive = SECONDARY_NAV.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black/95 backdrop-blur-xl">
      <div className="flex min-h-14 w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 xl:px-8 2xl:px-10">
        {/* Logo & Tenant badge */}
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

        {/* Organized Navigation */}
        <nav className="order-3 flex w-full items-center lg:order-none lg:mx-auto lg:w-auto">
          {/* Pills principales con scroll horizontal solo aquí */}
          <div className="flex items-center overflow-x-auto border border-zinc-800 bg-zinc-950 p-0.5">
            {PRIMARY_NAV.map(({ label, href }) => {
              const active = pathname === href || (href !== '/workspace' && pathname.startsWith(`${href}/`))
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
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
          </div>

          {/* Menú Más / Operación — FUERA de la zona scrollable para que el dropdown no se recorte */}
          <div className="relative shrink-0 ml-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium uppercase tracking-wider transition border border-zinc-800 ${
                isSecondaryActive || moreOpen
                  ? 'bg-zinc-800 text-white font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-zinc-800'
              }`}
            >
              <span>Más</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>

            {moreOpen && (
              <div className="absolute left-0 mt-1.5 w-72 max-h-[70vh] overflow-y-auto border border-zinc-800 bg-zinc-950 p-1 shadow-2xl z-50">
                <div className="px-3 py-1.5 border-b border-zinc-900 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Operación & Módulos
                </div>
                <div className="py-1">
                  {SECONDARY_NAV.map((item) => {
                    const Icon = item.icon
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-start gap-2.5 px-3 py-2 text-xs transition ${
                          active
                            ? 'bg-zinc-900 text-white font-bold border-l-2 border-white'
                            : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
                        <div>
                          <div className="font-semibold leading-tight">{item.label}</div>
                          <div className="text-[10px] text-zinc-500 font-mono leading-tight mt-0.5">{item.description}</div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
                {isAdmin && (
                  <div className="border-t border-zinc-900 p-1">
                    <a
                      href="/admin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white transition font-mono uppercase"
                    >
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        Payload Admin
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Barra de Acciones: Copilot Button + Search + Notificaciones + Perfil */}
        <div className="flex items-center gap-2">
          {/* Botón Asistente Copilot */}
          <button
            type="button"
            onClick={() => {
              // Disparar evento o abrir el trigger de CopilotKit
              const copilotBtn = document.querySelector('[aria-label="Open Copilot"]') as HTMLButtonElement | null
              if (copilotBtn) {
                copilotBtn.click()
              } else {
                window.dispatchEvent(new Event('workspace:open-copilot'))
              }
            }}
            title="Abrir Copiloto IA Comercial"
            className="flex items-center gap-1.5 border border-zinc-700/80 bg-zinc-900/80 hover:bg-zinc-800 hover:border-zinc-500 px-2.5 py-1.5 text-xs font-semibold text-white transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="font-mono text-xs hidden sm:inline">Copilot IA</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </button>

          {/* Búsqueda rápida ⌘K */}
          <button
            type="button"
            aria-label="Buscar (Ctrl/Cmd+K)"
            onClick={() => window.dispatchEvent(new Event('workspace:open-search'))}
            className="hidden sm:flex items-center gap-2 border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white transition"
          >
            <Search size={13} />
            <span className="font-mono">Buscar</span>
            <kbd className="border border-zinc-700 bg-zinc-950 px-1 text-[9px] font-mono">⌘K</kbd>
          </button>

          {/* Campana de Notificaciones & Alertas */}
          <NotificationBell />

          {/* User badge */}
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
      </div>
    </header>
  )
}
