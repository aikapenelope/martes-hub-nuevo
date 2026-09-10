import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

/**
 * Encabezado de página (sistema shadcn): eyebrow + título + descripción +
 * acciones. Reemplazo directo de `PageHero` de oled.tsx — mismas props para
 * que la migración de páginas sea mecánica. Server Component puro.
 */
export function PageHeader({
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
		<Card className="gap-0 py-4">
			<CardContent className="flex flex-col justify-between gap-4 px-4 xl:flex-row xl:items-end">
				<div>
					<p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						<span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
						{eyebrow}
					</p>
					<h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
					{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
					{notice && (
						<p className="mt-3 border border-border bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground" role="status">
							{notice}
						</p>
					)}
				</div>
				{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
			</CardContent>
		</Card>
	)
}
