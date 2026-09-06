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
  'border border-zinc-800 bg-black px-3 py-1.5 text-xs text-zinc-300 font-mono uppercase focus:outline-none focus:border-zinc-600'

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
      <section className="oled-card p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Operaciones / Tareas</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Trabajo del equipo</h1>
            <p className="mt-1 text-xs text-zinc-400">
              Prioriza, asigna y mueve el trabajo sin perder contexto del cliente.
            </p>
          </div>
          {canEdit && (
            <TaskCreateDialog
              assignees={data.assignees}
              clients={data.clients}
              leads={data.leads}
              variant="primary"
            />
          )}
        </div>
        {!canEdit && (
          <div className="mt-3 flex items-center gap-2 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 font-mono">
            <CircleAlert size={16} />
            <div>
              <strong className="text-white">Vista de solo lectura</strong> — tu rol permite
              consultar el trabajo, pero no modificarlo.
            </div>
          </div>
        )}
      </section>

      {(activeClient || activeLead) && (
        <section className="flex items-center justify-between border border-sky-800/80 bg-sky-950/30 px-4 py-2.5 text-xs text-sky-200 font-mono">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            <span>
              Filtrado por CRM:{' '}
              <strong className="text-white">
                {activeClient ? `Cliente: ${activeClient.name}` : `Lead: ${activeLead?.fullName}`}
              </strong>
            </span>
          </div>
          <Link
            href={buildTaskPaginationUrl(
              { ...filters, clientId: undefined, leadId: undefined },
              1,
            )}
            className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-sky-300 hover:text-white transition"
          >
            <X size={13} />
            <span>Quitar filtro</span>
          </Link>
        </section>
      )}

      {data.metrics.overdue > 0 && (
        <section className="border border-red-500/50 bg-red-950/20 p-4 shadow-xl mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-full border border-red-500/20">
              <CircleAlert className="text-red-400" size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-400 font-mono uppercase tracking-wider">¡Atención! Tareas Vencidas</h3>
              <p className="text-xs text-zinc-400">Tienes {data.metrics.overdue} tarea{data.metrics.overdue !== 1 ? 's' : ''} con fecha de entrega expirada.</p>
            </div>
          </div>
          <Link 
            href="/workspace/tasks?vencimiento=vencidas" 
            className="px-4 py-2 bg-red-950 border border-red-500/30 text-red-300 text-xs font-bold uppercase tracking-wider font-mono hover:bg-red-900/50 transition"
          >
            Ver Tareas
          </Link>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Resumen de tareas">
        {metricCards.map(([value, label, note]) => (
          <article key={label} className="oled-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">{label}</span>
              {label === 'Vencidas' ? (
                <CircleAlert size={16} className="text-red-400" />
              ) : (
                <CheckCircle2 size={16} className="text-zinc-500" />
              )}
            </div>
            <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{value}</div>
            <div className="mt-1 text-xs text-zinc-500">{note}</div>
          </article>
        ))}
      </section>

      <form className="flex flex-wrap items-center gap-2 oled-card p-3">
        <div className="inline-flex border border-zinc-800">
          <Link
            href="/workspace/tasks?vista=tablero"
            className={
              filters.view === 'tablero'
                ? 'px-3 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
                : 'px-3 py-1.5 text-xs text-zinc-400 hover:text-white uppercase tracking-wider'
            }
          >
            Tablero
          </Link>
          <Link
            href="/workspace/tasks?vista=lista"
            className={
              filters.view === 'lista'
                ? 'px-3 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider'
                : 'px-3 py-1.5 text-xs text-zinc-400 hover:text-white uppercase tracking-wider'
            }
          >
            Lista
          </Link>
        </div>
        <label className="flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1.5">
          <Search size={15} className="text-zinc-500" />
          <span className="sr-only">Buscar tareas</span>
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Buscar tareas..."
            className="bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none w-40"
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
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono transition"
        >
          <ListFilter size={14} />
          Aplicar
        </button>
      </form>

      {data.tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 oled-card py-12 text-zinc-500">
          <CheckCircle2 size={28} />
          <h2 className="text-sm text-white">No hay tareas en esta vista</h2>
          <p className="text-xs font-mono">Ajusta los filtros o crea la primera tarea para empezar.</p>
        </div>
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
