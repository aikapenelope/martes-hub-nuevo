import type { CrmFilters } from '@/lib/crm-filters'

/**
 * Construye la URL canónica para navegación y filtros del CRM.
 * Módulo seguro tanto en Server Components como en Client Components (sin directiva 'use client').
 */
export function buildCrmHref(
  filters: CrmFilters,
  changes: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams()
  params.set('vista', filters.view)
  if (filters.view === 'leads' && filters.mode !== 'pipeline') params.set('modo', filters.mode)
  if (filters.query) params.set('q', filters.query)
  if (filters.source) params.set('fuente', filters.source)
  const status = filters.view === 'leads' ? filters.status : filters.stage
  if (status !== 'todos') params.set('estado', status)
  if (filters.agent && filters.agent !== 'todos') params.set('agente', filters.agent)
  if (filters.page > 1) params.set('page', String(filters.page))
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '' || value === 'todos') params.delete(key)
    else params.set(key, String(value))
  }
  return `/workspace/crm?${params.toString()}`
}
