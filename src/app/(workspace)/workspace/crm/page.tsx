/**
 * CrmPage — `/workspace/crm`. Pipeline de leads y cartera de clientes,
 * con la misma UI Storelink (fondo negro, mono, bordes zinc-800) del resto
 * del workspace.
 */

import 'server-only'

import Link from 'next/link'
import { ArrowRight, Download, Search, UsersRound } from 'lucide-react'

import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import { CrmPipelineWorkspace } from '@/components/workspace/CrmPipelineWorkspace'
import { getCrmData, parseCrmFilters, type CrmSearchParams } from '@/lib/crm-data'
import { getCrmPipelineData } from '@/lib/crm-pipeline-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Lead, Segment, User } from '@/payload-types'

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
  apify: 'Apify',
  tally: 'Tally',
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  referido: 'Referido',
}

function relationName(value: number | Segment | User | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && value.name) return value.name
  if ('email' in value && value.email) return value.email
  return 'Sin asignar'
}

function buildHref(filters: ReturnType<typeof parseCrmFilters>, changes: Record<string, string | number | undefined>) {
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

interface CrmPageProps {
  searchParams: Promise<CrmSearchParams>
}

export default async function CrmPage({ searchParams }: CrmPageProps) {
  const params = await searchParams
  const filters = parseCrmFilters(params)
  const context = await getWorkspaceContext()
  const data = await getCrmData({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    filters,
  })

  const showPipeline = filters.view === 'leads' && filters.mode === 'pipeline'

  const [agentsResult, segmentsResult] = showPipeline
    ? await Promise.all([
        context.payload.find({
          collection: 'users',
          where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
          limit: 100,
          depth: 0,
          overrideAccess: false,
          user: context.user,
        }),
        context.payload.find({
          collection: 'segments',
          where: { tenant: { equals: context.tenantId } },
          limit: 200,
          depth: 0,
          overrideAccess: false,
          user: context.user,
        }),
      ])
    : [{ docs: [] as User[] }, { docs: [] as Segment[] }]

  const agents = agentsResult.docs as User[]
  const segmentsList = segmentsResult.docs as Segment[]
  const pipelineColumns = showPipeline
    ? await getCrmPipelineData({ payload: context.payload, user: context.user, tenantId: context.tenantId })
    : []

  const statusOptions = data.view === 'leads' ? leadLabels : clientLabels

  return (
    <>
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>CRM · {context.tenant.name}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Relaciones que avanzan</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Pipeline, cartera y contexto comercial del tenant activo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/admin/collections/${data.view}`}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
            >
              <Download className="w-4 h-4" /> Importar / exportar
            </a>
            {context.canEdit && <CrmFormDialog kind={data.view === 'leads' ? 'lead' : 'client'} />}
          </div>
        </div>
        {!context.canEdit && (
          <p className="mt-3 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 font-mono" role="status">
            Modo lectura — las modificaciones requieren rol agente o admin.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Leads abiertos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.totals.leads}</p>
        </div>
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Clientes activos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.totals.clients}</p>
        </div>
        <div className="border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Vista actual</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.view === 'leads' ? 'Pipeline' : 'Cartera'}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex border border-zinc-800 bg-zinc-950 p-0.5" aria-label="Vista CRM">
          <Link
            href={buildHref(filters, { vista: 'leads', modo: undefined, estado: undefined, page: 1 })}
            className={data.view === 'leads' ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'}
          >
            Leads
          </Link>
          <Link
            href={buildHref(filters, { vista: 'clientes', modo: undefined, estado: undefined, page: 1 })}
            className={data.view === 'clientes' ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'}
          >
            Clientes
          </Link>
        </nav>

        {filters.view === 'leads' && (
          <nav className="inline-flex border border-zinc-800 bg-zinc-950 p-0.5" aria-label="Modo de vista del pipeline">
            <Link
              href={buildHref(filters, { modo: undefined })}
              className={filters.mode === 'pipeline' ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'}
            >
              Pipeline Kanban
            </Link>
            <Link
              href={buildHref(filters, { modo: 'tabla' })}
              className={filters.mode === 'tabla' ? 'px-3.5 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white uppercase tracking-wider transition'}
            >
              Tabla
            </Link>
          </nav>
        )}
      </div>

      {showPipeline ? (
        <CrmPipelineWorkspace columns={pipelineColumns} canEdit={context.canEdit} assignees={agents} segments={segmentsList} />
      ) : (
        <>
          {data.view === 'leads' && (
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pipeline de leads">
              {data.pipeline.map((column) => (
                <Link
                  key={column.status}
                  href={buildHref(filters, { estado: column.status, page: 1 })}
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
              <Link href={buildHref(filters, { page: filters.page - 1 })} className="px-3 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500">Anterior</Link>
            ) : <span className="px-3 py-1 border border-zinc-900 text-zinc-700" aria-disabled="true">Anterior</span>}
            {data.pagination.hasNextPage ? (
              <Link href={buildHref(filters, { page: filters.page + 1 })} className="px-3 py-1 border border-zinc-700 text-zinc-300 hover:border-zinc-500">Siguiente</Link>
            ) : <span className="px-3 py-1 border border-zinc-900 text-zinc-700" aria-disabled="true">Siguiente</span>}
          </div>
        </footer>
      </section>
        </>
      )}
    </>
  )
}
