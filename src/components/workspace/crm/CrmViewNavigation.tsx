'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Kanban, Table as TableIcon, UserRound } from 'lucide-react'
import type { parseCrmFilters } from '@/lib/crm-data'
import { buildCrmHref } from '@/lib/crm-href'
import type { User } from '@/payload-types'
import { cn } from '@/lib/utils'

export function CrmViewNavigation({
  filters,
  view,
  agents,
  currentUser,
}: {
  filters: ReturnType<typeof parseCrmFilters>
  view: 'leads' | 'clientes' | 'empresas'
  agents?: User[]
  currentUser?: User
}) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Selector de Entidad (Leads, Clientes, Empresas) */}
      <nav className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40 gap-1" aria-label="Vista CRM">
        <Link
          href={buildCrmHref(filters, { vista: 'leads', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={cn(
            'px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors',
            view === 'leads'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Leads
        </Link>
        <Link
          href={buildCrmHref(filters, { vista: 'clientes', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={cn(
            'px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors',
            view === 'clientes'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Clientes
        </Link>
        <Link
          href={buildCrmHref(filters, { vista: 'empresas', modo: undefined, estado: undefined, fuente: undefined, page: 1 })}
          className={cn(
            'px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors',
            view === 'empresas'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Empresas
        </Link>
      </nav>

      {/* Selector de Agente */}
      {agents && currentUser && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <UserRound className="size-3.5 text-muted-foreground" />
            Agente:
          </label>
          <select 
            className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-sans"
            value={filters.agent || 'todos'}
            onChange={(e) => {
              router.push(buildCrmHref(filters, { agente: e.target.value }))
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

      {/* Modo de Visualización (Kanban vs Tabla) */}
      {filters.view === 'leads' && (
        <nav className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40 gap-1" aria-label="Modo de vista del pipeline">
          <Link
            href={buildCrmHref(filters, { modo: undefined })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              filters.mode === 'pipeline'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Kanban className="size-3.5" />
            Pipeline Kanban
          </Link>
          <Link
            href={buildCrmHref(filters, { modo: 'tabla' })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              filters.mode === 'tabla'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <TableIcon className="size-3.5" />
            Tabla
          </Link>
        </nav>
      )}
    </div>
  )
}
