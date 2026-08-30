import Link from 'next/link'
import { ArrowRight, Search, UsersRound } from 'lucide-react'
import type { getCrmData, parseCrmFilters } from '@/lib/crm-data'
import type { Lead, Segment, User } from '@/payload-types'
import { buildCrmHref } from './CrmViewNavigation'

const leadLabels = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  descartado: 'Descartado',
} as const

const clientLabels = {
  nuevo: 'Nuevo',
  activo: 'Activo',
  inactivo: 'Inactivo',
  perdido: 'Perdido',
} as const

const sourceLabels: Record<Lead['source'], string> = {
  manual: 'Manual',
  google_maps: 'Google Maps',
  puerta_fria: 'Puerta Fría',
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  linkedin: 'LinkedIn',
  tally: 'Tally / Web',
  apify: 'Apify',
  referido: 'Referido',
}

function relationName(value: number | Segment | User | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && value.name) return value.name
  if ('email' in value && value.email) return value.email
  return 'Sin asignar'
}

export function CrmTableListView({
  data,
  filters,
}: {
  data: Awaited<ReturnType<typeof getCrmData>>
  filters: ReturnType<typeof parseCrmFilters>
}) {
  const statusOptions = data.view === 'leads' ? leadLabels : clientLabels

  return (
    <>
      {data.view === 'leads' && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pipeline de leads">
          {data.pipeline.map((column) => (
            <Link
              key={column.status}
              href={buildCrmHref(filters, { estado: column.status, page: 1 })}
              className={`border p-3 transition ${filters.status === column.status ? 'border-white bg-zinc-900' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'}`}
            >
              <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">{leadLabels[column.status]}</span>
              <strong className="mt-1 block text-xl font-bold text-white font-mono">{column.total}</strong>
            </Link>
          ))}
        </section>
      )}

      <section className="border border-zinc-800 bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
          <form className="flex flex-wrap items-center gap-2">
            <input name="vista" type="hidden" value={data.view} />
            <label className="flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1.5">
              <Search className="w-4 h-4 text-zinc-500" aria-hidden="true" />
              <span className="sr-only">Buscar por nombre, correo o teléfono</span>
              <input
                defaultValue={filters.query}
                name="q"
                maxLength={120}
                placeholder="Buscar nombre, correo o teléfono"
                type="search"
                className="bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none w-48"
              />
            </label>
            <select
              defaultValue={data.view === 'leads' ? filters.status : filters.stage}
              name="estado"
              className="border border-zinc-800 bg-black px-3 py-1.5 text-xs text-zinc-300 font-mono uppercase"
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(statusOptions).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Aplicar filtros
            </button>
          </form>
          {(filters.query || (data.view === 'leads' ? filters.status : filters.stage) !== 'todos') && (
            <Link href={`/workspace/crm?vista=${data.view}`} className="text-xs text-zinc-400 hover:text-white font-mono">
              Limpiar filtros
            </Link>
          )}
        </div>

        {(data.view === 'leads' ? data.leads.length : data.clients.length) === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
            <UsersRound className="w-7 h-7" aria-hidden="true" />
            <strong className="text-sm text-white">No encontramos registros</strong>
            <span className="text-xs font-mono">Ajusta los filtros o crea el primer {data.view === 'leads' ? 'lead' : 'cliente'}.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                {data.view === 'leads' ? 'Leads del tenant activo' : 'Clientes del tenant activo'}
              </caption>
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Nombre</th>
                  <th className="px-4 py-2.5 font-medium">Contacto</th>
                  <th className="px-4 py-2.5 font-medium">{data.view === 'leads' ? 'Origen / segmento' : 'Segmento / agente'}</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {data.view === 'leads'
                  ? data.leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                        <td className="px-4 py-3">
                          <Link href={`/workspace/crm/leads/${lead.id}`} className="font-semibold text-white hover:underline">{lead.fullName}</Link>
                          <div className="mt-0.5 text-[10px] text-zinc-500 font-mono">Creado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(lead.createdAt))}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          <div>{lead.email || 'Sin email'}</div>
                          <div>{lead.phone || 'Sin teléfono'}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          <div>{sourceLabels[lead.source]}</div>
                          <div className="text-[10px]">{relationName(lead.segment)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 ${lead.status === 'descartado' ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
                            {leadLabels[lead.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link aria-label={`Abrir ficha de ${lead.fullName}`} href={`/workspace/crm/leads/${lead.id}`} className="text-zinc-500 hover:text-white">
                            <ArrowRight className="w-4 h-4 inline" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  : data.clients.map((client) => (
                      <tr key={client.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                        <td className="px-4 py-3">
                          <Link href={`/workspace/crm/clientes/${client.id}`} className="font-semibold text-white hover:underline">{client.name}</Link>
                          <div className="mt-0.5 text-[10px] text-zinc-500 font-mono">Actualizado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(client.updatedAt))}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          <div>{client.email || 'Sin email'}</div>
                          <div>{client.phone || 'Sin teléfono'}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          <div>{relationName(client.segment)}</div>
                          <div className="text-[10px]">{relationName(client.assignedAgent)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 ${client.stage === 'perdido' ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
                            {clientLabels[client.stage]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link aria-label={`Abrir ficha de ${client.name}`} href={`/workspace/crm/clientes/${client.id}`} className="text-zinc-500 hover:text-white">
                            <ArrowRight className="w-4 h-4 inline" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex items-center justify-between gap-4 border-t border-zinc-800 p-4 text-xs font-mono text-zinc-500">
          <span>
            {data.pagination.totalDocs} registros · Página {data.pagination.page} de {Math.max(data.pagination.totalPages, 1)}
          </span>
          <div className="flex gap-2">
            {data.pagination.hasPrevPage ? (
              <Link href={buildCrmHref(filters, { page: filters.page - 1 })} className="px-3 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500">Anterior</Link>
            ) : <span className="px-3 py-1 border border-zinc-900 text-zinc-700" aria-disabled="true">Anterior</span>}
            {data.pagination.hasNextPage ? (
              <Link href={buildCrmHref(filters, { page: filters.page + 1 })} className="px-3 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500">Siguiente</Link>
            ) : <span className="px-3 py-1 border border-zinc-900 text-zinc-700" aria-disabled="true">Siguiente</span>}
          </div>
        </footer>
      </section>
    </>
  )
}
