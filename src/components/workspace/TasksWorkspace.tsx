import Link from 'next/link'
import { CheckCircle2, CircleAlert, Clock3, ListFilter, Plus, Search, UserRound } from 'lucide-react'
import type { Client, Lead, Task, User } from '@/payload-types'
import { checklistProgress, dueState, TASK_PRIORITIES, TASK_STATUSES, type TaskFilters, type TaskStatus } from '@/lib/tasks-filters'
import { changeTaskStatusAction, createTaskAction } from '@/lib/tasks-actions'

const statusLabel: Record<TaskStatus, string> = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada' }
const priorityLabel = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' }
const priorityCls: Record<keyof typeof priorityLabel, string> = {
  baja: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
  media: 'bg-zinc-800 text-zinc-200 border border-zinc-600',
  alta: 'bg-amber-900/50 text-amber-300 border border-amber-800',
  urgente: 'bg-red-900/50 text-red-400 border border-red-800',
}
const dueCls: Record<ReturnType<typeof dueState>, string> = {
  overdue: 'text-red-400',
  today: 'text-amber-300',
  upcoming: 'text-zinc-400',
  none: 'text-zinc-600',
}
const person = (user: number | User | null | undefined) => user && typeof user === 'object' ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : 'Sin asignar'
const relation = (task: Task) => task.client && typeof task.client === 'object' ? task.client.name : task.lead && typeof task.lead === 'object' ? task.lead.fullName : 'Sin relación CRM'
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(value)) : 'Sin fecha'

const inputCls = 'border border-zinc-800 bg-black px-3 py-1.5 text-xs text-zinc-300 font-mono uppercase'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'
const formInputCls = 'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'

function TaskCard({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const progress = checklistProgress(task.checklist)
  const due = dueState(task.dueDate)
  return (
    <article className="oled-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 ${priorityCls[task.priority]}`}>{priorityLabel[task.priority]}</span>
        <span className={`flex items-center gap-1 text-[10px] font-mono ${dueCls[due]}`}><Clock3 size={12} />{dateLabel(task.dueDate)}</span>
      </div>
      <Link href={`/workspace/tasks/${task.id}`} className="mt-2 block text-sm font-semibold text-white hover:underline">{task.title}</Link>
      <p className="mt-1 text-xs text-zinc-500">{relation(task)}</p>
      {progress.total > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] font-mono text-zinc-500"><span>{progress.done}/{progress.total} subtareas</span><span>{progress.percent}%</span></div>
          <progress
            max="100"
            value={progress.percent}
            aria-label={`Progreso del checklist: ${progress.done} de ${progress.total} (${progress.percent}%)`}
            className="mt-1 h-1 w-full accent-white"
          />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-400"><UserRound size={13} />{person(task.assignedTo)}</span>
        {canEdit && (
          <form action={changeTaskStatusAction}>
            <input type="hidden" name="id" value={task.id} />
            <select
              name="status"
              defaultValue={task.status}
              aria-label={`Cambiar estado de ${task.title}`}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono uppercase"
            >
              {TASK_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
            </select>
          </form>
        )}
      </div>
    </article>
  )
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
    pagination: { page: number; totalPages: number; hasPrevPage: boolean; hasNextPage: boolean }
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
            <p className="mt-1 text-xs text-zinc-400">Prioriza, asigna y mueve el trabajo sin perder contexto del cliente.</p>
          </div>
          {canEdit && (
            <details className="group">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
                <Plus size={16} />Nueva tarea
              </summary>
              <div className="mt-3 oled-card p-4">
                <strong className="block text-sm text-white">Nueva tarea</strong>
                <span className="text-xs text-zinc-400">Define el resultado y quién lo llevará.</span>
                <TaskForm assignees={data.assignees} clients={data.clients} leads={data.leads} />
              </div>
            </details>
          )}
        </div>
        {!canEdit && (
          <div className="mt-3 flex items-center gap-2 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
            <CircleAlert size={16} />
            <div><strong className="text-white">Vista de solo lectura</strong> — tu rol permite consultar el trabajo, pero no modificarlo.</div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Resumen de tareas">
        {metricCards.map(([value, label, note]) => (
          <article key={label} className="oled-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">{label}</span>
              {label === 'Vencidas' ? <CircleAlert size={16} className="text-red-400" /> : <CheckCircle2 size={16} className="text-zinc-500" />}
            </div>
            <div className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{value}</div>
            <div className="mt-1 text-xs text-zinc-500">{note}</div>
          </article>
        ))}
      </section>

      <form className="flex flex-wrap items-center gap-2 oled-card p-3">
        <div className="inline-flex border border-zinc-800">
          <Link href="/workspace/tasks?vista=tablero" className={filters.view === 'tablero' ? 'px-3 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3 py-1.5 text-xs text-zinc-400 hover:text-white uppercase tracking-wider'}>Tablero</Link>
          <Link href="/workspace/tasks?vista=lista" className={filters.view === 'lista' ? 'px-3 py-1.5 text-xs font-bold bg-white text-black uppercase tracking-wider' : 'px-3 py-1.5 text-xs text-zinc-400 hover:text-white uppercase tracking-wider'}>Lista</Link>
        </div>
        <label className="flex items-center gap-2 border border-zinc-800 bg-black px-3 py-1.5">
          <Search size={15} className="text-zinc-500" />
          <span className="sr-only">Buscar tareas</span>
          <input name="q" defaultValue={filters.query} placeholder="Buscar tareas..." className="bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none w-40" />
        </label>
        <select name="estado" defaultValue={filters.status} className={inputCls}>
          <option value="todos">Todos los estados</option>
          {TASK_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
        </select>
        <select name="prioridad" defaultValue={filters.priority} className={inputCls}>
          <option value="todas">Todas las prioridades</option>
          {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}
        </select>
        <select name="responsable" defaultValue={filters.assignee} className={inputCls}>
          <option value="todos">Todo el equipo</option>
          {data.assignees.map((user) => <option key={user.id} value={user.id}>{person(user)}</option>)}
        </select>
        <select name="vencimiento" defaultValue={filters.due} className={inputCls}>
          <option value="todos">Cualquier fecha</option>
          <option value="vencidas">Vencidas</option>
          <option value="hoy">Hoy</option>
          <option value="semana">Próximos 7 días</option>
          <option value="sin_fecha">Sin fecha</option>
        </select>
        <input type="hidden" name="vista" value={filters.view} />
        <button type="submit" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono">
          <ListFilter size={14} />Aplicar
        </button>
      </form>

      {data.tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 oled-card py-12 text-zinc-500">
          <CheckCircle2 size={28} />
          <h2 className="text-sm text-white">No hay tareas en esta vista</h2>
          <p className="text-xs font-mono">Ajusta los filtros o crea la primera tarea para empezar.</p>
        </div>
      ) : filters.view === 'tablero' ? (
        <section className="grid gap-3 lg:grid-cols-5" aria-label="Tablero de tareas">
          {data.columns.map((column) => (
            <section key={column.status} className="oled-card">
              <header className="flex items-center gap-2 border-b border-zinc-800 p-3">
                <span className="h-2 w-2 rounded-full bg-white" />
                <h2 className="flex-1 text-xs font-bold text-white uppercase tracking-wider">{statusLabel[column.status]}</h2>
                <span className="text-xs font-mono text-zinc-500">{column.total}</span>
              </header>
              <div className="flex flex-col gap-2 p-2">
                {column.tasks.length ? column.tasks.map((task) => <TaskCard key={task.id} task={task} canEdit={canEdit} />) : <p className="p-3 text-center text-xs text-zinc-600">Sin tareas</p>}
              </div>
            </section>
          ))}
        </section>
      ) : (
        <section className="oled-card">
          <div className="grid grid-cols-5 gap-2 border-b border-zinc-800 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Tarea</span><span>Estado</span><span>Prioridad</span><span>Responsable</span><span>Vencimiento</span>
          </div>
          {data.tasks.map((task) => (
            <Link href={`/workspace/tasks/${task.id}`} key={task.id} className="grid grid-cols-5 gap-2 border-b border-zinc-900 px-4 py-3 text-xs hover:bg-zinc-900/40 last:border-0">
              <span><strong className="block text-white">{task.title}</strong><small className="text-zinc-500">{relation(task)}</small></span>
              <span className="text-zinc-300">{statusLabel[task.status]}</span>
              <span><span className={`text-[10px] font-mono px-1.5 py-0.5 ${priorityCls[task.priority]}`}>{priorityLabel[task.priority]}</span></span>
              <span className="text-zinc-400">{person(task.assignedTo)}</span>
              <span className={dueCls[dueState(task.dueDate)]}>{dateLabel(task.dueDate)}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  )
}

function TaskForm({ assignees, clients, leads }: { assignees: User[]; clients: Client[]; leads: Lead[] }) {
  return (
    <form action={createTaskAction} className="mt-3 flex flex-col gap-3">
      <label className={labelCls}>Título<input name="title" required maxLength={180} className={formInputCls} /></label>
      <label className={labelCls}>Descripción<textarea name="description" rows={3} className={formInputCls} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          Estado
          <select name="status" defaultValue="pendiente" className={formInputCls}>
            {TASK_STATUSES.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Prioridad
          <select name="priority" defaultValue="media" className={formInputCls}>
            {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}
          </select>
        </label>
        <label className={labelCls}>Fecha límite<input type="date" name="dueDate" className={formInputCls} /></label>
        <label className={labelCls}>
          Responsable
          <select name="assignedTo" className={formInputCls}>
            <option value="">Sin asignar</option>
            {assignees.map((user) => <option key={user.id} value={user.id}>{person(user)}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Cliente
          <select name="client" className={formInputCls}>
            <option value="">Ninguno</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Lead
          <select name="lead" className={formInputCls}>
            <option value="">Ninguno</option>
            {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.fullName}</option>)}
          </select>
        </label>
      </div>
      <label className={labelCls}>Checklist <small className="text-zinc-500">(una subtarea por línea)</small><textarea name="checklist" rows={4} className={formInputCls} /></label>
      <div>
        <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Crear tarea</button>
      </div>
    </form>
  )
}
