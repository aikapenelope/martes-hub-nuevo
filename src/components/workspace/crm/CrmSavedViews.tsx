import Link from 'next/link'
import { BookmarkPlus, X } from 'lucide-react'

import type { CrmFilters } from '@/lib/crm-filters'
import { crmViewHref, crmViewMatches, type SavedCrmViewLike } from '@/lib/crm-views'
import { createCrmSavedViewAction, deleteCrmSavedViewAction } from '@/lib/crm-view-actions'

/**
 * Barra de vistas guardadas del CRM: chips privados por usuario que
 * re-aplican un conjunto de filtros con un clic, guardado de la vista actual
 * (upsert por nombre) y borrado individual. Server component: aplicar es
 * navegación y guardar/borrar son server actions — cero JS de cliente.
 */
export function CrmSavedViews({
  views,
  filters,
  canEdit,
}: {
  views: SavedCrmViewLike[]
  filters: CrmFilters
  canEdit: boolean
}) {
  if (views.length === 0 && !canEdit) return null

  const estado = filters.view === 'leads' ? (filters.status === 'todos' ? '' : filters.status) : filters.stage === 'todos' ? '' : filters.stage

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card text-card-foreground px-4 py-3 shadow-xs">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Vistas guardadas
      </span>

      {views.length === 0 && (
        <span className="text-xs text-muted-foreground">Guarda tu primer filtro para re-aplicarlo aquí con un clic.</span>
      )}

      {views.map((view) => {
        const active = crmViewMatches(view, filters)
        return (
          <span
            key={view.id}
            className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
              active
                ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                : 'border-border bg-muted/50 text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            <Link href={crmViewHref(view)} className="px-2.5 py-1">
              {view.name}
            </Link>
            {canEdit && (
              <form action={deleteCrmSavedViewAction} className="pr-1.5 flex items-center">
                <input type="hidden" name="viewId" value={view.id} />
                <button
                  type="submit"
                  title="Eliminar vista"
                  aria-label={`Eliminar vista ${view.name}`}
                  className="text-muted-foreground/60 transition-colors hover:text-destructive p-0.5 rounded"
                >
                  <X size={12} />
                </button>
              </form>
            )}
          </span>
        )
      })}

      {canEdit && (
        <form action={createCrmSavedViewAction} className="ml-auto flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="vista" value={filters.view} />
          <input type="hidden" name="modo" value={filters.mode} />
          <input type="hidden" name="q" value={filters.query} />
          <input type="hidden" name="estado" value={estado} />
          <input type="hidden" name="fuente" value={filters.source ?? ''} />
          <input type="hidden" name="agente" value={filters.agent ?? 'todos'} />
          <input
            name="name"
            required
            maxLength={60}
            placeholder="Nombre para esta vista…"
            className="h-8 w-52 rounded-lg border border-input bg-background px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none font-sans"
          />
          <button
            type="submit"
            title="Guardar los filtros actuales como vista"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <BookmarkPlus className="size-3.5 text-primary" /> Guardar vista
          </button>
        </form>
      )}
    </section>
  )
}
