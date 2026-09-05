import Link from 'next/link'
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListFilter,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import type { Client, Lead, Task, User } from '@/payload-types'
import {
  checklistProgress,
  dueState,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskFilters,
  type TaskStatus,
} from '@/lib/tasks-filters'
import { TasksKanbanBoard } from '@/components/workspace/tasks/TasksKanbanBoard'
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

const priorityCls: Record<keyof typeof priorityLabel, string> = {
  baja: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
  media: 'bg-zinc-800 text-zinc-200 border border-zinc-600',
  alta: 'bg-amber-900/50 text-amber-300 border border-amber-800',
  urgente: 'bg-red-900/50 text-red-400 border border-red-800',
}

const dueCls: Record<ReturnType<typeof dueState>, string> = {
  overdue: 'text-red-400 font-bold',
  today: 'text-amber-300 font-bold',
  upcoming: 'text-zinc-400',
  none: 'text-zinc-600',
}

const person = (user: number | User | null | undefined) =>
  user && typeof user === 'object'
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
    : 'Sin asignar'

const relation = (task: Task) =>
  task.client && typeof task.client === 'object'
    ? task.client.name
    : task.lead && typeof task.lead === 'object'
      ? task.lead.fullName
      : 'Sin relación CRM'

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(value))
    : 'Sin fecha'

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
        <TasksKanbanBoard initialColumns={data.columns} canEdit={canEdit} />
      ) : (
        <section className="oled-card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span className="col-span-5 sm:col-span-4">Tarea / Contexto CRM</span>
            <span className="col-span-2 text-center sm:text-left">Estado</span>
            <span className="col-span-2 text-center sm:text-left">Prioridad</span>
            <span className="hidden sm:col-span-2 sm:block">Responsable</span>
            <span className="col-span-3 sm:col-span-2 text-right sm:text-left">Vencimiento</span>
          </div>
          <div className="divide-y divide-zinc-900">
            {data.tasks.map((task) => {
              const progress = checklistProgress(task.checklist)
              const due = dueState(task.dueDate)
              return (
                <Link
                  href={`/workspace/tasks/${task.id}`}
                  key={task.id}
                  className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs transition-colors hover:bg-zinc-900/40 group"
                >
                  <div className="col-span-5 sm:col-span-4 min-w-0 pr-2">
                    <strong className="block text-sm font-medium text-white group-hover:text-sky-300 transition-colors truncate">
                      {task.title}
                    </strong>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500 font-mono truncate">
                      <span>{relation(task)}</span>
                      {progress.total > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-400">
                            {progress.done}/{progress.total} subtareas
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 text-center sm:text-left">
                    <span className="inline-block px-2 py-0.5 text-[10px] font-mono border border-zinc-800 bg-zinc-900 text-zinc-300">
                      {statusLabel[task.status]}
                    </span>
                  </div>

                  <div className="col-span-2 text-center sm:text-left">
                    <span
                      className={`inline-block text-[10px] font-mono px-1.5 py-0.5 ${priorityCls[task.priority]}`}
                    >
                      {priorityLabel[task.priority]}
                    </span>
                  </div>

                  <div className="hidden sm:col-span-2 sm:flex sm:items-center sm:gap-1.5 text-zinc-400 truncate font-mono text-[11px]">
                    <UserRound size={13} className="shrink-0 text-zinc-500" />
                    <span className="truncate">{person(task.assignedTo)}</span>
                  </div>

                  <div className="col-span-3 sm:col-span-2 text-right sm:text-left">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${dueCls[due]}`}>
                      <Clock3 size={12} className="shrink-0 hidden sm:inline" />
                      {dateLabel(task.dueDate)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {data.pagination.totalPages > 1 && (
            <footer className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400 font-mono">
              <span>
                Página {data.pagination.page} de {data.pagination.totalPages} ({data.pagination.totalDocs} tareas)
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={buildTaskPaginationUrl(filters, data.pagination.page - 1)}
                  className={`px-3 py-1 border border-zinc-800 uppercase tracking-wider text-xs transition ${
                    data.pagination.hasPrevPage
                      ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                      : 'pointer-events-none opacity-40 text-zinc-600'
                  }`}
                >
                  Anterior
                </Link>
                <Link
                  href={buildTaskPaginationUrl(filters, data.pagination.page + 1)}
                  className={`px-3 py-1 border border-zinc-800 uppercase tracking-wider text-xs transition ${
                    data.pagination.hasNextPage
                      ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                      : 'pointer-events-none opacity-40 text-zinc-600'
                  }`}
                >
                  Siguiente
                </Link>
              </div>
            </footer>
          )}
        </section>
      )}
    </>
  )
}
