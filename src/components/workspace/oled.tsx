/**
 * Componentes visuales compartidos del workspace — wrappers con API idéntica
 * a la original, pero renderizando el sistema shadcn (src/components/ui/) y
 * tokens de tema (bg-card/border-border/muted-foreground). La identidad OLED
 * vive en los tokens calibrados (#122) y la paleta (sky/amber/emerald/rose).
 * Así TODAS las páginas que importan estos componentes ya renderizan shadcn
 * sin cambiar una línea; el cleanup final renombra/elimina este archivo.
 * Los acentos de paleta se conservan: no son parte del sistema `oled-*`.
 * Todos son Server Components puros — la interactividad vive en quien los usa.
 */

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkline } from '@/components/workspace/charts'
import { PageHeader } from '@/components/workspace/page-header'

/** Tarjeta base (antes clase `oled-card`, ahora tokens del tema). */
export function OledCard({
	children,
	className = '',
	bracketAccent = false,
	onClick,
}: {
	children: ReactNode
	className?: string
	bracketAccent?: boolean
	onClick?: () => void
}) {
	return (
		<div
			onClick={onClick}
			className={`bg-card text-card-foreground border border-border p-3.5 ${bracketAccent ? 'bracket-accent' : ''} ${className}`}
		>
			{children}
		</div>
	)
}

/** Sub-tarjeta anidada dentro de un `OledCard` (fila de lista, item de feed, etc). */
export function OledSubcard({ children, className = '' }: { children: ReactNode; className?: string }) {
	return <div className={`border border-border bg-muted/40 p-3 ${className}`}>{children}</div>
}

/**
 * Encabezado de página: eyebrow + título + descripción + acciones. Delega en
 * el PageHeader shadcn (mismas props) — un solo implementation source.
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
		<PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} notice={notice} />
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
			? 'bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300'
			: 'border border-border bg-muted font-mono text-xs font-bold uppercase text-foreground hover:bg-accent'

	const content = (
		<>
			{Icon && <Icon className="h-4 w-4" />}
			{children}
		</>
	)

	if (type === 'button') {
		return (
			<Button type="button" onClick={onClick} className={cls}>
				{content}
			</Button>
		)
	}
	if (!href) return null
	return (
		<Button asChild className={cls}>
			<Link href={href}>{content}</Link>
		</Button>
	)
}

const kpiAccentCls: Record<string, string> = {
	sky: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
	indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
	cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
	amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
	rose: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}
const sparkColor: Record<string, string> = {
	sky: '#38bdf8',
	indigo: '#818cf8',
	cyan: '#22d3ee',
	amber: '#fbbf24',
	rose: '#f43f5e',
}

/** Tarjeta KPI de alto contraste (icono + etiqueta + valor + nota), idéntica a las del dashboard. */
export function KpiCard({
	label,
	value,
	icon: Icon,
	accent = 'sky',
	note,
	trend,
	sparkline,
}: {
	label: string
	value: ReactNode
	icon: LucideIcon
	accent?: 'sky' | 'indigo' | 'cyan' | 'amber' | 'rose'
	note?: ReactNode
	trend?: ReactNode
	/** Serie corta (7-30 puntos) para una mini-tendencia inline; se omite si no hay datos suficientes. */
	sparkline?: number[]
}) {
	return (
		<Card className="gap-0 py-3.5">
			<CardContent className="space-y-2 px-3.5">
				<div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-muted-foreground">
					<span>{label}</span>
					<span className={`border p-1.5 ${kpiAccentCls[accent]}`}>
						<Icon className="h-4 w-4" />
					</span>
				</div>
				<div className="flex items-baseline justify-between">
					<span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
					{trend}
				</div>
				<div className="flex items-center justify-between gap-2">
					{note && <div className="font-mono text-[11px] text-muted-foreground">{note}</div>}
					{sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={sparkColor[accent]} />}
				</div>
			</CardContent>
		</Card>
	)
}

/** Cabecera de sección dentro de una tarjeta: eyebrow + título + acción opcional a la derecha. */
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
		<div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
			<div>
				<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
				<h2 className="text-sm font-black uppercase tracking-wide text-foreground">{title}</h2>
				{description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
			</div>
			{action}
		</div>
	)
}

/** Estado vacío honesto — nunca se rellena con datos de ejemplo. */
export function EmptyState({ children }: { children: ReactNode }) {
	return <div className="py-10 text-center font-mono text-xs text-muted-foreground">{children}</div>
}

const statusVariant = {
	neutral: 'outline',
	success: 'success',
	warning: 'warning',
	danger: 'destructive',
} as const

/** Badge de estado (pagado/vencido/programado/etc), coloreado por semántica. */
export function StatusBadge({
	children,
	tone = 'neutral',
}: {
	children: ReactNode
	tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
	return (
		<Badge variant={statusVariant[tone]} className="font-mono text-[10px]">
			{children}
		</Badge>
	)
}
