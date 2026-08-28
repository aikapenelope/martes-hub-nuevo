/**
 * CrmView — Payload custom admin view registrada en `/admin/crm`.
 *
 * Puerto de la antigua página `(workspace)/crm/page.tsx`: mismo contrato de datos
 * (getCrmData + parseCrmFilters) y misma UI, con los hrefs apuntando al namespace
 * `/admin/...` en vez de las rutas standalone del route group `(workspace)`.
 *
 * `searchParams` llega como objeto plano desde Payload (AdminViewServerProps), no
 * como Promise de Next.js App Router — se acepta ambas formas y se usa `?? {}`
 * como fallback cuando Payload no lo inyecta.
 */

import 'server-only'

import Link from 'next/link'
import { ArrowRight, Download, Search, UsersRound } from 'lucide-react'

import { CrmFormDialog } from '@/components/admin/CrmFormDialog'
import { getCrmData, parseCrmFilters, type CrmSearchParams } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Client, Lead, Segment, User } from '@/payload-types'

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
  if (filters.query) params.set('q', filters.query)
  const status = filters.view === 'leads' ? filters.status : filters.stage
  if (status !== 'todos') params.set('estado', status)
  if (filters.page > 1) params.set('page', String(filters.page))
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '' || value === 'todos') params.delete(key)
    else params.set(key, String(value))
  }
  return `/admin/crm?${params.toString()}`
}

function Contact({ record }: { record: Lead | Client }) {
  return (
    <div className="crm-contact">
      {record.email ? <span>{record.email}</span> : <span>Sin email</span>}
      {record.phone ? <span>{record.phone}</span> : <span>Sin teléfono</span>}
    </div>
  )
}

interface CrmViewProps {
  searchParams?: CrmSearchParams | Promise<CrmSearchParams>
}

export async function CrmView({ searchParams }: CrmViewProps = {}) {
  const params = (await searchParams) ?? {}
  const filters = parseCrmFilters(params)
  const context = await getWorkspaceContext()
  const data = await getCrmData({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    filters,
  })

  const records = data.view === 'leads' ? data.leads : data.clients
  const statusOptions = data.view === 'leads' ? leadLabels : clientLabels

  return (
    <main className="workspace-page crm-page">
      <header className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow">
            <span className="workspace-eyebrow-dot" aria-hidden="true" />
            CRM · {context.tenant.name}
          </div>
          <h1 className="workspace-title">Relaciones que avanzan</h1>
          <p className="workspace-subtitle">
            Pipeline, cartera y contexto comercial en un solo lugar. Todos los datos pertenecen al tenant activo.
          </p>
        </div>
        <div className="workspace-actions">
          <a className="workspace-button" href={`/admin/collections/${data.view}`}>
            <Download aria-hidden="true" size={16} />
            Importar / exportar
          </a>
          {context.canEdit && <CrmFormDialog kind={data.view === 'leads' ? 'lead' : 'client'} />}
        </div>
      </header>

      {!context.canEdit && (
        <aside className="crm-readonly" role="status">
          Estás en modo lectura. Puedes consultar toda la cartera, pero las modificaciones requieren rol agente o admin.
        </aside>
      )}

      <section className="crm-summary" aria-label="Resumen CRM">
        <div>
          <span>Leads abiertos</span>
          <strong>{data.totals.leads}</strong>
        </div>
        <div>
          <span>Clientes activos</span>
          <strong>{data.totals.clients}</strong>
        </div>
        <div>
          <span>Vista actual</span>
          <strong>{data.view === 'leads' ? 'Pipeline' : 'Cartera'}</strong>
        </div>
      </section>

      <nav className="crm-tabs" aria-label="Vista CRM">
        <Link data-active={data.view === 'leads'} href={buildHref(filters, { vista: 'leads', estado: undefined, page: 1 })}>
          Leads
        </Link>
        <Link data-active={data.view === 'clientes'} href={buildHref(filters, { vista: 'clientes', estado: undefined, page: 1 })}>
          Clientes
        </Link>
      </nav>

      {data.view === 'leads' && (
        <section className="crm-pipeline" aria-label="Pipeline de leads">
          {data.pipeline.map((column) => (
            <Link
              className="crm-pipeline-column"
              data-selected={filters.status === column.status}
              href={buildHref(filters, { estado: column.status, page: 1 })}
              key={column.status}
            >
              <span>{leadLabels[column.status]}</span>
              <strong>{column.total}</strong>
            </Link>
          ))}
        </section>
      )}

      <section className="workspace-card crm-table-card">
        <div className="crm-filterbar">
          <form className="crm-search-form">
            <input name="vista" type="hidden" value={data.view} />
            <label className="crm-search-input">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Buscar por nombre, correo o teléfono</span>
              <input
                defaultValue={filters.query}
                name="q"
                maxLength={120}
                placeholder="Buscar nombre, correo o teléfono"
                type="search"
              />
            </label>
            <label className="crm-filter-select">
              <span className="sr-only">Filtrar por estado</span>
              <select
                defaultValue={data.view === 'leads' ? filters.status : filters.stage}
                name="estado"
              >
                <option value="todos">Todos los estados</option>
                {Object.entries(statusOptions).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button className="workspace-button" type="submit">Aplicar filtros</button>
          </form>
          {(filters.query || (data.view === 'leads' ? filters.status : filters.stage) !== 'todos') && (
            <Link className="crm-clear-filter" href={`/admin/crm?vista=${data.view}`}>Limpiar filtros</Link>
          )}
        </div>

        {records.length === 0 ? (
          <div className="workspace-empty crm-empty">
            <UsersRound aria-hidden="true" size={28} />
            <strong>No encontramos registros</strong>
            <span>Ajusta los filtros o crea el primer {data.view === 'leads' ? 'lead' : 'cliente'}.</span>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <caption className="sr-only">
                {data.view === 'leads' ? 'Leads del tenant activo' : 'Clientes del tenant activo'}
              </caption>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contacto</th>
                  <th>{data.view === 'leads' ? 'Origen / segmento' : 'Segmento / agente'}</th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {data.view === 'leads'
                  ? data.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td data-label="Nombre">
                          <Link className="crm-record-name" href={`/admin/crm/leads/${lead.id}`}>{lead.fullName}</Link>
                          <small>Creado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(lead.createdAt))}</small>
                        </td>
                        <td data-label="Contacto"><Contact record={lead} /></td>
                        <td data-label="Origen / segmento">
                          <span>{sourceLabels[lead.source]}</span>
                          <small>{relationName(lead.segment)}</small>
                        </td>
                        <td data-label="Estado"><span className="workspace-badge" data-tone={lead.status === 'descartado' ? 'danger' : undefined}>{leadLabels[lead.status]}</span></td>
                        <td><Link aria-label={`Abrir ficha de ${lead.fullName}`} className="crm-row-action" href={`/admin/crm/leads/${lead.id}`}><ArrowRight aria-hidden="true" size={17} /></Link></td>
                      </tr>
                    ))
                  : data.clients.map((client) => (
                      <tr key={client.id}>
                        <td data-label="Nombre">
                          <Link className="crm-record-name" href={`/admin/crm/clientes/${client.id}`}>{client.name}</Link>
                          <small>Actualizado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(client.updatedAt))}</small>
                        </td>
                        <td data-label="Contacto"><Contact record={client} /></td>
                        <td data-label="Segmento / agente">
                          <span>{relationName(client.segment)}</span>
                          <small>{relationName(client.assignedAgent)}</small>
                        </td>
                        <td data-label="Estado"><span className="workspace-badge" data-tone={client.stage === 'perdido' ? 'danger' : undefined}>{clientLabels[client.stage]}</span></td>
                        <td><Link aria-label={`Abrir ficha de ${client.name}`} className="crm-row-action" href={`/admin/crm/clientes/${client.id}`}><ArrowRight aria-hidden="true" size={17} /></Link></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="crm-pagination">
          <span>
            {data.pagination.totalDocs} registros · Página {data.pagination.page} de {Math.max(data.pagination.totalPages, 1)}
          </span>
          <div>
            {data.pagination.hasPrevPage ? (
              <Link className="workspace-button" href={buildHref(filters, { page: filters.page - 1 })}>Anterior</Link>
            ) : <span className="workspace-button" aria-disabled="true">Anterior</span>}
            {data.pagination.hasNextPage ? (
              <Link className="workspace-button" href={buildHref(filters, { page: filters.page + 1 })}>Siguiente</Link>
            ) : <span className="workspace-button" aria-disabled="true">Siguiente</span>}
          </div>
        </footer>
      </section>
    </main>
  )
}
