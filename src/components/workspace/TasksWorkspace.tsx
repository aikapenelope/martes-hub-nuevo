import Link from 'next/link'
import {
  CheckCircle2,
  CircleAlert,
  ListFilter,
  Search,
  X,
} from 'lucide-react'
import type { Client, Lead, Task, User } from '@/payload-types'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskFilters,
  type TaskStatus,
} from '@/lib/tasks-filters'
import { TasksKanbanBoard } from '@/components/workspace/tasks/TasksKanbanBoard'
import { TasksListView } from '@/components/workspace/tasks/TasksListView'
import { TaskCreateDialog } from '@/components/workspace/TaskCreateDialog'
import { EmptyState, PageHero } from '@/components/workspace/oled'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const priorityLabel = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

const person = (user: number | User | null | undefined) =>
  user && typeof user === 'object'
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
    : 'Sin asignar'

const inputCls =
  'border border-border bg-background px-3 py-1.5 font-mono text-xs uppercase text-foreground focus:outline-none focus:border-ring'

function buildTaskPaginationUrl(filters: TaskFilters, targetPage: number): string {
  const params = new URLSearchParams()
  if (filters.view) params.set('vista', filters.view)
  if (filters.query) params.set('q', filters.query)
  if (filters.status && filters.status !== 'todos') params.set('estado', filters.status)
  if (filters.priority && filters.priority !== 'todas') params.set('prioridad', filters.priority)
  if (filters.assignee && filters.assignee !== 'todos')
    params.set('responsable', String(filters.assignee))
  if (filters.due && filters.due !== 'todos') params.set('vencimiento', filters.due)
  if (filters.clientId) params.set('client', String(filters.clientId))
  if (filters.leadId) params.set('lead', String(filters.leadId))
  if (targetPage > 1) params.set('page', String(targetPage))
  return `/workspace/tasks?${params.toString()}`
}

export function TasksWorkspace({
  data,
  filters,
  canEdit,
}: {
  data: {
    tasks: Task[]
    columns: { status: TaskStatus; total: number; tasks: Task[] }[]
    metrics: { pending: number; inProgress: number; overdue: number; completedWeek: number }
    assignees: User[]
    clients: Client[]
    leads: Lead[]
    pagination: {
      page: number
      totalPages: number
      totalDocs: number
      hasPrevPage: boolean
      hasNextPage: boolean
    }
  }
  filters: TaskFilters
  canEdit: boolean
}) {
  const metricCards: [number, string, string][] = [
    [data.metrics.pending, 'Pendientes', 'Por iniciar'],
    [data.metrics.inProgress, 'En progreso', 'Trabajo activo'],
    [data.metrics.overdue, 'Vencidas', 'Necesitan atención'],
    [data.metrics.completedWeek, 'Completadas', 'Últimos 7 días'],
  ]

  const activeClient = filters.clientId
    ? data.clients.find((c) => c.id === filters.clientId)
    : undefined
  const activeLead = filters.leadId
    ? data.leads.find((l) => l.id === filters.leadId)
    : undefined

  return (
    <>
      <PageHero
        eyebrow="Operaciones / Tareas"
        title="Trabajo del equipo"
        description="Prioriza, asigna y mueve el trabajo sin perder contexto del cliente."
        actions={
          canEdit ? (
            <TaskCreateDialog
              assignees={data.assignees}
              clients={data.clients}
              leads={data.leads}
              variant="primary"
            />
          ) : undefined
        }
        notice={
          canEdit
            ? undefined
            : 'Vista de solo lectura — tu rol permite consultar el trabajo, pero no modificarlo.'
        }
      />

      {(activeClient || activeLead) && (
        <section className="flex items-center justify-between border border-sky-800/80 bg-sky-950/30 px-4 py-2.5 font-mono text-xs text-sky-200">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
            <span>
              Filtrado por CRM:{' '}
              <strong className="text-foreground">
                {activeClient ? `Cliente: ${activeClient.name}` : `Lead: ${activeLead?.fullName}`}
              </strong>
            </span>
          </div>
          <Link
            href={buildTaskPaginationUrl(
              { ...filters, clientId: undefined, leadId: undefined },
              1,
            )}
            className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-sky-300 transition hover:text-foreground"
          >
            <X size={13} />
            <span>Quitar filtro</span>
          </Link>
        </section>
      )}

      {data.metrics.overdue > 0 && (
        <section className="mb-4 flex items-center justify-between border border-red-500/50 bg-red-950/20 p-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-red-500/20 bg-red-500/10 p-2">
              <CircleAlert className="text-red-400" size={24} />
            </div>
            <div>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-red-400">¡Atención! Tareas Vencidas</h3>
              <p className="text-xs text-muted-foreground">Tienes {data.metrics.overdue} tarea{data.metrics.overdue !== 1 ? 's' : ''} con fecha de entrega expirada.</p>
            </div>
          </div>
          <Link
            href="/workspace/tasks?vencimiento=vencidas"
            className="border border-red-500/30 bg-red-950 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-red-300 transition hover:bg-red-900/50"
          >
            Ver Tareas
          </Link>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Resumen de tareas">
        {metricCards.map(([value, label, note]) => (
          <article key={label} className="border border-border bg-card p-3.5 text-card-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
              {label === 'Vencidas' ? (
                <CircleAlert size={16} className="text-red-400" />
              ) : (
                <CheckCircle2 size={16} className="text-muted-foreground" />
              )}
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-foreground">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{note}</div>
          </article>
        ))}
      </section>

      <form className="flex flex-wrap items-center gap-2 border border-border bg-card p-3 text-card-foreground">
        <div className="inline-flex border border-border">
          <Link
            href="/workspace/tasks?vista=tablero"
            className={
              filters.view === 'tablero'
                ? 'bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground'
                : 'px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground'
            }
          >
            Tablero
          </Link>
          <Link
            href="/workspace/tasks?vista=lista"
            className={
              filters.view === 'lista'
                ? 'bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground'
                : 'px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground'
            }
          >
            Lista
          </Link>
        </div>
        <label className="flex items-center gap-2 border border-border bg-background px-3 py-1.5">
          <Search size={15} className="text-muted-foreground" />
          <span className="sr-only">Buscar tareas</span>
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Buscar tareas..."
            className="w-40 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        <select name="estado" defaultValue={filters.status} className={inputCls}>
          <option value="todos">Todos los estados</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </select>
        <select name="prioridad" defaultValue={filters.priority} className={inputCls}>
          <option value="todas">Todas las prioridades</option>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabel[priority]}
            </option>
          ))}
        </select>
        <select name="responsable" defaultValue={filters.assignee} className={inputCls}>
          <option value="todos">Todo el equipo</option>
          {data.assignees.map((user) => (
            <option key={user.id} value={user.id}>
              {person(user)}
            </option>
          ))}
        </select>
        <select name="vencimiento" defaultValue={filters.due} className={inputCls}>
          <option value="todos">Cualquier fecha</option>
          <option value="vencidas">Vencidas</option>
          <option value="hoy">Hoy</option>
          <option value="semana">Próximos 7 días</option>
          <option value="sin_fecha">Sin fecha</option>
        </select>
        <input type="hidden" name="vista" value={filters.view} />
        {filters.clientId && <input type="hidden" name="client" value={filters.clientId} />}
        {filters.leadId && <input type="hidden" name="lead" value={filters.leadId} />}
        <Button
          type="submit"
          className="gap-1.5 border-border bg-muted px-3.5 font-mono text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent"
        >
          <ListFilter className="size-3.5" />
          Aplicar
        </Button>
      </form>

      {data.tasks.length === 0 ? (
        <Card className="py-12">
          <EmptyState>
            <CheckCircle2 size={28} className="mx-auto" />
            <h2 className="mt-2 text-sm text-foreground">No hay tareas en esta vista</h2>
            <p>Ajusta los filtros o crea la primera tarea para empezar.</p>
          </EmptyState>
        </Card>
      ) : filters.view === 'tablero' ? (
        <TasksKanbanBoard
          initialColumns={data.columns}
          canEdit={canEdit}
          assignees={data.assignees}
        />
      ) : (
        <TasksListView
          tasks={data.tasks}
          canEdit={canEdit}
          assignees={data.assignees}
          filters={filters}
          pagination={data.pagination}
        />
      )}
    </>
  )
}
