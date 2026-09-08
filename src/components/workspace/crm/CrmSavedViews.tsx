import Link from 'next/link'
import { BookmarkPlus, X } from 'lucide-react'

import type { CrmFilters } from '@/lib/crm-filters'
import { crmViewHref, crmViewMatches, type SavedCrmViewLike } from '@/lib/crm-views'
import { createCrmSavedViewAction, deleteCrmSavedViewAction } from '@/lib/crm-view-actions'

/**
 * Barra de vistas guardadas del CRM (ítem 4): chips privados por usuario que
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
    <section className="flex flex-wrap items-center gap-2 border border-zinc-800 bg-zinc-950 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        Vistas guardadas
      </span>

      {views.length === 0 && (
        <span className="text-xs text-zinc-600">Guardá tu primer filtro para re-aplicarlo aquí.</span>
      )}

      {views.map((view) => {
        const active = crmViewMatches(view, filters)
        return (
          <span
            key={view.id}
            className={`inline-flex items-center border text-xs transition ${
              active
                ? 'border-white bg-zinc-900 text-white'
                : 'border-zinc-800 bg-black text-zinc-300 hover:border-zinc-600'
            }`}
          >
            <Link href={crmViewHref(view)} className="px-2.5 py-1">
              {view.name}
            </Link>
            {canEdit && (
              <form action={deleteCrmSavedViewAction} className="pr-1">
                <input type="hidden" name="viewId" value={view.id} />
                <button
                  type="submit"
                  title="Eliminar vista"
                  aria-label={`Eliminar vista ${view.name}`}
                  className="text-zinc-500 transition hover:text-red-400"
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
            className="border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none w-52"
          />
          <button
            type="submit"
            title="Guardar los filtros actuales como vista"
            className="inline-flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-zinc-800 font-mono"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Guardar vista
          </button>
        </form>
      )}
    </section>
  )
}
