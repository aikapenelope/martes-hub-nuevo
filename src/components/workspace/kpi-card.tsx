import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

const accentCls: Record<string, string> = {
	sky: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
	indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
	cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
	amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
	rose: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}

/**
 * Tarjeta KPI (sistema shadcn): etiqueta mono + valor grande + icono de
 * acento + nota opcional. Reemplazo directo de `KpiCard` de oled.tsx —
 * Server Component puro, la identidad OLED vive en los tokens y paleta.
 */
export function KpiCard({
	label,
	value,
	icon: Icon,
	accent = 'sky',
	note,
	action,
}: {
	label: string
	value: ReactNode
	icon: LucideIcon
	accent?: 'sky' | 'indigo' | 'cyan' | 'amber' | 'rose'
	note?: ReactNode
	/** Elemento a la derecha del valor (delta, sparkline, link). */
	action?: ReactNode
}) {
	return (
		<Card className="gap-0 py-4">
			<CardContent className="space-y-2 px-4">
				<div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-muted-foreground">
					<span>{label}</span>
					<span className={`border p-1.5 ${accentCls[accent]}`}>
						<Icon className="h-4 w-4" />
					</span>
				</div>
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
					{action}
				</div>
				{note && <div className="font-mono text-[11px] text-muted-foreground">{note}</div>}
			</CardContent>
		</Card>
	)
}
