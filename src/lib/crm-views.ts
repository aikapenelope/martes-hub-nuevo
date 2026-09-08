import { buildCrmHref } from '@/lib/crm-href'
import { parseCrmFilters, type CrmFilters, type CrmSearchParams } from '@/lib/crm-filters'

/**
 * Helpers puros para las vistas guardadas del CRM (ítem 4). Toda vista se
 * normaliza con parseCrmFilters (mismas listas blancas y límites que la URL)
 * antes de construir su href o compararse con los filtros actuales — una
 * vista guardada jamás puede expresar algo que la URL no aceptaría.
 */

export interface SavedCrmViewLike {
  id: number
  name: string
  vista: string
  modo?: string | null
  q?: string | null
  estado?: string | null
  fuente?: string | null
  agente?: string | null
}

/** Normaliza una vista guardada a filtros canónicos (whitelists de la URL). */
export function crmViewToFilters(view: SavedCrmViewLike): CrmFilters {
  const params: CrmSearchParams = {
    vista: view.vista,
    modo: view.modo ?? undefined,
    q: view.q ?? undefined,
    estado: view.estado ?? undefined,
    fuente: view.fuente ?? undefined,
    agente: view.agente ?? undefined,
  }
  return parseCrmFilters(params)
}

/** URL del CRM que aplica la vista (siempre arranca en página 1). */
export function crmViewHref(view: SavedCrmViewLike): string {
  return buildCrmHref(crmViewToFilters(view), { page: undefined })
}

/** ¿La vista coincide exactamente con los filtros actuales? (para resaltarla) */
export function crmViewMatches(view: SavedCrmViewLike, filters: CrmFilters): boolean {
  const normalized = crmViewToFilters(view)
  const estado = normalized.view === 'leads' ? normalized.status : normalized.stage
  const currentEstado = filters.view === 'leads' ? filters.status : filters.stage
  return (
    normalized.view === filters.view &&
    normalized.mode === filters.mode &&
    normalized.query === filters.query &&
    estado === currentEstado &&
    (normalized.source ?? undefined) === (filters.source ?? undefined) &&
    (normalized.agent ?? 'todos') === (filters.agent ?? 'todos')
  )
}

/**
 * Extrae los valores crudos de un formulario de guardado a los campos de la
 * colección. La validación real la hace parseCrmFilters en el server action.
 */
export function savedViewFieldsFromParams(params: CrmSearchParams): {
  vista: string
  modo: string
  q: string
  estado: string
  fuente: string
  agente: string
} {
  const filters = parseCrmFilters(params)
  const raw = (value?: string | string[]) => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''))
  const firstOf = (value?: string | string[]): string => {
    const v = raw(value)
    return v
  }
  return {
    vista: filters.view,
    modo: filters.mode,
    q: filters.query,
    estado: firstOf(params.estado),
    fuente: firstOf(params.fuente),
    agente: firstOf(params.agente) || 'todos',
  }
}
