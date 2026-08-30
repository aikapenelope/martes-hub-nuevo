import Link from 'next/link'
import type { parseCrmFilters } from '@/lib/crm-data'

export function buildCrmHref(
  filters: ReturnType<typeof parseCrmFilters>,
  changes: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams()
  params.set('vista', filters.view)
  if (filters.view === 'leads' && filters.mode !== 'pipeline') params.set('modo', filters.mode)
  if (filters.query) params.set('q', filters.query)
  const status = filters.view === 'leads' ? filters.status : filters.stage
  if (status !== 'todos') params.set('estado', status)
  if (filters.page > 1) params.set('page', String(filters.page))
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '' || value === 'todos') params.delete(key)
    else params.set(key, String(value))
  }
  return `/workspace/crm?${params.toString()}`
}

export function CrmViewNavigation({
  filters,
  view,
}: {
  filters: ReturnType<typeof parseCrmFilters>
  view: 'leads' | 'clientes'
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="inline-flex border border-zinc-800 bg-zinc-950 p-0.5" aria-label="Vista CRM">
        <Link
          href={buildCrmHref(filters, { vista: 'leads', modo: undefined, estado: undefined, page: 1 })}
          className={
            view === 'leads'
              ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
              : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
          }
        >
          Leads
        </Link>
        <Link
          href={buildCrmHref(filters, { vista: 'clientes', modo: undefined, estado: undefined, page: 1 })}
          className={
            view === 'clientes'
              ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
              : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
          }
        >
          Clientes
        </Link>
      </nav>

      {filters.view === 'leads' && (
        <nav className="inline-flex border border-zinc-800 bg-zinc-950 p-0.5" aria-label="Modo de vista del pipeline">
          <Link
            href={buildCrmHref(filters, { modo: undefined })}
            className={
              filters.mode === 'pipeline'
                ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
                : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
            }
          >
            Pipeline Kanban
          </Link>
          <Link
            href={buildCrmHref(filters, { modo: 'tabla' })}
            className={
              filters.mode === 'tabla'
                ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
                : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
            }
          >
            Tabla
          </Link>
        </nav>
      )}
    </div>
  )
}
