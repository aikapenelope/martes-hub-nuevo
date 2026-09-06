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

import type { User } from '@/payload-types'

export function CrmViewNavigation({
  filters,
  view,
  agents,
  currentUser
}: {
  filters: ReturnType<typeof parseCrmFilters>
  view: 'leads' | 'clientes' | 'empresas'
  agents?: User[]
  currentUser?: User
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="inline-flex border border-zinc-800 bg-zinc-950 p-0.5" aria-label="Vista CRM">
        <Link
          href={buildCrmHref(filters, { vista: 'leads', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={
            view === 'leads'
              ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
              : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
          }
        >
          Leads
        </Link>
        <Link
          href={buildCrmHref(filters, { vista: 'clientes', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={
            view === 'clientes'
              ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
              : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
          }
        >
          Clientes
        </Link>
        <Link
          href={buildCrmHref(filters, { vista: 'empresas', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={
            view === 'empresas'
              ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
              : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'
          }
        >
          Empresas
        </Link>
      </nav>

      {agents && currentUser && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono uppercase tracking-wider text-zinc-500">Agente:</label>
          <select 
            className="border border-zinc-800 bg-black px-2 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
            value={filters.agent || 'todos'}
            onChange={(e) => {
              window.location.href = buildCrmHref(filters, { agente: e.target.value })
            }}
          >
            <option value="todos">Todos los Agentes</option>
            <option value="me">Yo ({currentUser.firstName || currentUser.email})</option>
            {agents.filter(a => a.id !== currentUser.id).map(a => (
              <option key={a.id} value={a.id}>{a.firstName || a.email}</option>
            ))}
          </select>
        </div>
      )}

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
