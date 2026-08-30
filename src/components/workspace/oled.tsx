/**
 * Componentes visuales compartidos del workspace — Torre de Control Comercial
 * (Deep OLED). Extraídos del dashboard (`/workspace`) para que todas las
 * páginas (`analytics`, `billing`, `social`, `crm`, `hoy`, `inbox`, `tasks`)
 * usen el mismo lenguaje visual en vez de repetir las mismas clases de
 * Tailwind. Todos son Server Components puros (sin estado, sin `use client`)
 * — la interactividad vive en los componentes que los envuelven.
 */

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Tarjeta base OLED (`oled-card`, definida en `src/styles/workspace.css`). */
export function OledCard({
  children,
  className = '',
  bracketAccent = false,
}: {
  children: ReactNode
  className?: string
  bracketAccent?: boolean
}) {
  return (
    <div className={`oled-card p-4 ${bracketAccent ? 'bracket-accent' : ''} ${className}`}>{children}</div>
  )
}

/** Sub-tarjeta anidada dentro de un `OledCard` (fila de lista, item de feed, etc). */
export function OledSubcard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`oled-subcard p-3 ${className}`}>{children}</div>
}

/**
 * Encabezado de página: eyebrow + título + descripción + acciones. Mismo
 * patrón que el "TOP COMMAND STRIP" del dashboard, reutilizado en cada
 * página del workspace para que la jerarquía visual sea consistente.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  notice,
}: {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  notice?: string
}) {
  return (
    <OledCard bracketAccent className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
          <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" />
          <span>{eyebrow}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono uppercase">{title}</h1>
        {description && <p className="mt-1 text-xs text-zinc-400">{description}</p>}
        {notice && (
          <p className="mt-3 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 font-mono" role="status">
            {notice}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 font-mono text-xs">{actions}</div>}
    </OledCard>
  )
}

/** Botón/link de acción del PageHero, en las 2 variantes usadas en todo el workspace. */
export function HeroAction({
  href,
  onClick,
  icon: Icon,
  children,
  variant = 'secondary',
  type = 'link',
}: {
  href?: string
  onClick?: () => void
  icon?: LucideIcon
  children: ReactNode
  variant?: 'primary' | 'secondary'
  type?: 'link' | 'button'
}) {
  const cls =
    variant === 'primary'
      ? 'px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition'

  const content = (
    <>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </>
  )

  if (type === 'button') {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    )
  }
  if (!href) return null
  return (
    <a href={href} className={cls}>
      {content}
    </a>
  )
}

/** Tarjeta KPI de alto contraste (icono + etiqueta + valor + nota), idéntica a las del dashboard. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  accent = 'sky',
  note,
  trend,
}: {
  label: string
  value: ReactNode
  icon: LucideIcon
  accent?: 'sky' | 'indigo' | 'cyan' | 'amber' | 'rose'
  note?: ReactNode
  trend?: ReactNode
}) {
  const accentCls: Record<string, string> = {
    sky: 'bg-sky-950/80 text-sky-400 border-sky-800/80',
    indigo: 'bg-indigo-950/80 text-indigo-400 border-indigo-800/80',
    cyan: 'bg-cyan-950/80 text-cyan-400 border-cyan-800/80',
    amber: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
    rose: 'bg-rose-950/80 text-rose-400 border-rose-800/80',
  }

  return (
    <OledCard className="space-y-2.5">
      <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase tracking-wider">
        <span>{label}</span>
        <span className={`p-1.5 border ${accentCls[accent]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-black text-white font-mono">{value}</span>
        {trend}
      </div>
      {note && <div className="text-[11px] font-mono text-zinc-400">{note}</div>}
    </OledCard>
  )
}

/** Cabecera de sección dentro de un OledCard: eyebrow + título + link/acción opcional a la derecha. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 pb-2.5 border-b border-zinc-800 mb-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{eyebrow}</p>
        <h2 className="text-sm font-black text-white uppercase tracking-wide">{title}</h2>
        {description && <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Estado vacío honesto — nunca se rellena con datos de ejemplo. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-xs text-zinc-500 font-mono">{children}</div>
}

/** Badge de estado (pagado/vencido/programado/etc), coloreado por semántica. */
export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const toneCls: Record<string, string> = {
    neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    success: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
    warning: 'bg-amber-900/50 text-amber-400 border-amber-800',
    danger: 'bg-red-900/50 text-red-400 border-red-800',
  }
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${toneCls[tone]}`}>{children}</span>
  )
}
