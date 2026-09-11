import Link from 'next/link'
import { ArrowRight, Search, UsersRound } from 'lucide-react'
import type { getCrmData, parseCrmFilters } from '@/lib/crm-data'
import type { Lead, Segment, User } from '@/payload-types'
import { buildCrmHref } from '@/lib/crm-href'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  llamada_fria: 'Llamada Fría',
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

  const recordCount =
    data.view === 'leads'
      ? data.leads.length
      : data.view === 'clientes'
        ? data.clients.length
        : data.companies.length

  return (
    <>
      {data.view === 'leads' && (
        <section aria-label="Pipeline de leads">
          <div className="grid grid-cols-2 gap-px bg-border p-px rounded-xl overflow-hidden sm:grid-cols-4">
            {data.pipeline.map((column) => {
              const active = filters.status === column.status
              return (
                <Link
                  key={column.status}
                  href={buildCrmHref(filters, { estado: column.status, page: 1 })}
                  className={cn(
                    'flex flex-col p-4 transition-colors',
                    active
                      ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/40'
                      : 'bg-card hover:bg-muted/40 text-card-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {leadLabels[column.status]}
                    </span>
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <strong className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
                    {column.total}
                  </strong>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3.5 sm:p-4">
          <form className="flex flex-wrap items-center gap-2">
            <input name="vista" type="hidden" value={data.view} />
            {/* Preservar el agente seleccionado: sin esto, cada búsqueda lo resetea. */}
            <input name="agente" type="hidden" value={filters.agent ?? 'todos'} />
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <span className="sr-only">Buscar por nombre, correo o teléfono</span>
              <Input
                defaultValue={filters.query}
                name="q"
                maxLength={120}
                placeholder="Buscar nombre, correo o teléfono..."
                type="search"
                className="h-8 pl-8 text-xs w-48 sm:w-64 bg-background"
              />
            </div>
            {data.view !== 'empresas' && (
              <select
                defaultValue={data.view === 'leads' ? filters.status : filters.stage}
                name="estado"
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="todos">Todos los estados</option>
                {Object.entries(statusOptions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <Button type="submit" size="sm" variant="default" className="h-8 text-xs font-semibold px-3">
              Aplicar filtros
            </Button>
          </form>
          {(filters.query || (data.view !== 'empresas' && (data.view === 'leads' ? filters.status : filters.stage) !== 'todos')) && (
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
              <Link href={`/workspace/crm?vista=${data.view}&agente=${filters.agent ?? 'todos'}`}>
                Limpiar filtros
              </Link>
            </Button>
          )}
        </div>

        {recordCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <UsersRound className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <strong className="text-sm font-semibold text-foreground">No encontramos registros</strong>
            <span className="text-xs text-muted-foreground max-w-sm">
              Ajusta los filtros o crea el primer {data.view === 'leads' ? 'lead' : data.view === 'clientes' ? 'cliente' : 'empresa'}.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                {data.view === 'leads'
                  ? 'Leads del tenant activo'
                  : data.view === 'clientes'
                    ? 'Clientes del tenant activo'
                    : 'Empresas del tenant activo'}
              </caption>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[30%]">Nombre</TableHead>
                  <TableHead className="w-[20%]">{data.view === 'empresas' ? 'RIF / CIF' : 'Contacto'}</TableHead>
                  <TableHead className="w-[25%]">
                    {data.view === 'leads' ? 'Origen / Segmento' : data.view === 'clientes' ? 'Segmento / Agente' : 'Contacto general'}
                  </TableHead>
                  <TableHead className="w-[20%]">{data.view === 'empresas' ? 'Ubicación / Segmento' : 'Estado'}</TableHead>
                  <TableHead className="w-[5%] text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.view === 'leads' &&
                  data.leads.map((lead) => (
                    <TableRow key={lead.id} className="border-border hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3">
                        <Link
                          href={`/workspace/crm/leads/${lead.id}`}
                          className="font-medium text-foreground hover:underline decoration-primary underline-offset-4"
                        >
                          {lead.fullName}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Creado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(lead.createdAt))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div className="text-foreground/90 font-medium">
                          {lead.email || <span className="text-muted-foreground/50">Sin email</span>}
                        </div>
                        <div>{lead.phone || <span className="text-muted-foreground/50">Sin teléfono</span>}</div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div>
                          <Badge variant="outline" className="text-[10px] font-normal py-0 px-1.5">
                            {sourceLabels[lead.source]}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground/80">{relationName(lead.segment)}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant={
                            lead.status === 'descartado'
                              ? 'destructive'
                              : lead.status === 'calificado'
                                ? 'default'
                                : 'secondary'
                          }
                          className={cn(
                            'text-[10px] font-semibold uppercase tracking-wider',
                            lead.status === 'nuevo' && 'bg-sky-500/10 text-sky-500 border-sky-500/20',
                            lead.status === 'contactado' && 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                            lead.status === 'calificado' && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                            lead.status === 'descartado' && 'bg-destructive/10 text-destructive border-destructive/20'
                          )}
                        >
                          {leadLabels[lead.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Link
                          aria-label={`Abrir ficha de ${lead.fullName}`}
                          href={`/workspace/crm/leads/${lead.id}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                {data.view === 'clientes' &&
                  data.clients.map((client) => (
                    <TableRow key={client.id} className="border-border hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3">
                        <Link
                          href={`/workspace/crm/clientes/${client.id}`}
                          className="font-medium text-foreground hover:underline decoration-primary underline-offset-4"
                        >
                          {client.name}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Actualizado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(client.updatedAt))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div className="text-foreground/90 font-medium">
                          {client.email || <span className="text-muted-foreground/50">Sin email</span>}
                        </div>
                        <div>{client.phone || <span className="text-muted-foreground/50">Sin teléfono</span>}</div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div className="text-foreground/90">{relationName(client.segment)}</div>
                        <div className="text-[11px] text-muted-foreground/80">{relationName(client.assignedAgent)}</div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant={
                            client.stage === 'perdido'
                              ? 'destructive'
                              : client.stage === 'activo'
                                ? 'default'
                                : 'secondary'
                          }
                          className={cn(
                            'text-[10px] font-semibold uppercase tracking-wider',
                            client.stage === 'nuevo' && 'bg-sky-500/10 text-sky-500 border-sky-500/20',
                            client.stage === 'activo' && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                            client.stage === 'inactivo' && 'bg-muted text-muted-foreground border-border',
                            client.stage === 'perdido' && 'bg-destructive/10 text-destructive border-destructive/20'
                          )}
                        >
                          {clientLabels[client.stage]}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Link
                          aria-label={`Abrir ficha de ${client.name}`}
                          href={`/workspace/crm/clientes/${client.id}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                {data.view === 'empresas' &&
                  data.companies.map((company) => (
                    <TableRow key={company.id} className="border-border hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3">
                        <Link
                          href={`/workspace/crm/empresas/${company.id}`}
                          className="font-medium text-foreground hover:underline decoration-primary underline-offset-4"
                        >
                          {company.name}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Actualizado {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(company.updatedAt))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs font-mono text-muted-foreground">
                        {company.taxId || <span className="text-muted-foreground/50 font-sans">Sin RIF/CIF</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div className="text-foreground/90 font-medium">
                          {company.email || <span className="text-muted-foreground/50">Sin email</span>}
                        </div>
                        <div>{company.phone || <span className="text-muted-foreground/50">Sin teléfono</span>}</div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">
                        <div className="text-foreground/90">
                          {company.city ? `${company.city}${company.state ? `, ${company.state}` : ''}` : 'Sin ciudad'}
                        </div>
                        <div className="text-[11px] text-muted-foreground/80">{relationName(company.segment)}</div>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Link
                          aria-label={`Abrir ficha de ${company.name}`}
                          href={`/workspace/crm/empresas/${company.id}`}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-3.5 sm:p-4 text-xs text-muted-foreground">
          <span className="font-medium">
            <span className="font-semibold text-foreground tabular-nums">{data.pagination.totalDocs}</span> registros · Página{' '}
            <span className="font-semibold text-foreground tabular-nums">{data.pagination.page}</span> de{' '}
            <span className="font-semibold text-foreground tabular-nums">{Math.max(data.pagination.totalPages, 1)}</span>
          </span>
          <div className="flex gap-2">
            {data.pagination.hasPrevPage ? (
              <Button asChild size="sm" variant="outline" className="h-8 text-xs font-medium">
                <Link href={buildCrmHref(filters, { page: filters.page - 1 })}>Anterior</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="h-8 text-xs font-medium opacity-40">
                Anterior
              </Button>
            )}
            {data.pagination.hasNextPage ? (
              <Button asChild size="sm" variant="outline" className="h-8 text-xs font-medium">
                <Link href={buildCrmHref(filters, { page: filters.page + 1 })}>Siguiente</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled className="h-8 text-xs font-medium opacity-40">
                Siguiente
              </Button>
            )}
          </div>
        </footer>
      </section>
    </>
  )
}
