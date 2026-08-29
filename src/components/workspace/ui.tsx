/**
 * Primitivas visuales compartidas del workspace — estilo Storelink
 * (bordes zinc-800, fondos zinc-950/negro, etiquetas mono en mayúsculas).
 * Se usan en todas las páginas de `/workspace` para mantener consistencia
 * sin repetir las mismas cadenas de clases de Tailwind en cada módulo.
 */

import type { ComponentType, ReactNode } from 'react'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
            <span className="w-2 h-2 bg-white inline-block" />
            <span>{eyebrow}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}

export function KpiCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string | number
  note: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <article className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{value}</p>
        </div>
        <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5">
        <span className="font-mono text-xs text-zinc-400">{note}</span>
      </div>
    </article>
  )
}

export function Panel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{eyebrow}</p>
          ) : null}
          <h2 className="text-base font-bold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center py-8 text-xs text-zinc-500 font-mono">{children}</div>
}

export function Badge({ tone, children }: { tone?: 'default' | 'danger' | 'success'; children: ReactNode }) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-900/50 text-red-400 border border-red-800'
      : tone === 'success'
        ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
        : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
  return <span className={`text-[10px] font-mono px-1.5 py-0.5 ${toneClass}`}>{children}</span>
}

/**
 * Skeleton — placeholder de carga. No lleva `aria-busy` propio: el
 * contenedor que lo usa (una sección/página con estado `loading`) es quien
 * debe anunciar el estado de carga a lectores de pantalla, típicamente vía
 * un `<span className="sr-only">Cargando…</span>` junto a los skeletons.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-zinc-800/60 ${className}`} />
}
