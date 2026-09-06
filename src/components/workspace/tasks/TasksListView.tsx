'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock3, UserRound } from 'lucide-react'
import type { Task, User } from '@/payload-types'
import {
  checklistProgress,
  dueState,
  type TaskFilters,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks-filters'
import { TaskSlideOverDrawer } from '@/components/workspace/tasks/TaskSlideOverDrawer'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const priorityLabel: Record<TaskPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

const priorityCls: Record<TaskPriority, string> = {
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

interface TasksListViewProps {
  tasks: Task[]
  canEdit: boolean
  assignees: User[]
  filters: TaskFilters
  pagination: {
    page: number
    totalPages: number
    totalDocs: number
    hasPrevPage: boolean
    hasNextPage: boolean
  }
}

export function TasksListView({
  tasks: initialTasks,
  canEdit,
  assignees,
  filters,
  pagination,
}: TasksListViewProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks)
    setTasks(initialTasks)
  }

  function handleTaskUpdated(updatedTask: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    if (selectedTask?.id === updatedTask.id) {
      setSelectedTask(updatedTask)
    }
  }

  return (
    <>
      <section className="oled-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          <span className="col-span-5 sm:col-span-4">Tarea / Contexto CRM</span>
          <span className="col-span-2 text-center sm:text-left">Estado</span>
          <span className="col-span-2 text-center sm:text-left">Prioridad</span>
          <span className="hidden sm:col-span-2 sm:block">Responsable</span>
          <span className="col-span-3 sm:col-span-2 text-right sm:text-left">Vencimiento</span>
        </div>

        <div className="divide-y divide-zinc-900">
          {tasks.map((task) => {
            const progress = checklistProgress(task.checklist)
            const due = dueState(task.dueDate)

            return (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedTask(task)
                  setIsDrawerOpen(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedTask(task)
                    setIsDrawerOpen(true)
                  }
                }}
                className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs transition-colors hover:bg-zinc-900/50 group cursor-pointer"
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
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-mono ${dueCls[due]}`}
                  >
                    <Clock3 size={12} className="shrink-0 hidden sm:inline" />
                    {dateLabel(task.dueDate)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {pagination.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400 font-mono">
            <span>
              Página {pagination.page} de {pagination.totalPages} ({pagination.totalDocs} tareas)
            </span>
            <div className="flex items-center gap-2">
              <Link
                href={buildTaskPaginationUrl(filters, pagination.page - 1)}
                className={`px-3 py-1 border border-zinc-800 uppercase tracking-wider text-xs transition ${
                  pagination.hasPrevPage
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                    : 'pointer-events-none opacity-40 text-zinc-600'
                }`}
              >
                Anterior
              </Link>
              <Link
                href={buildTaskPaginationUrl(filters, pagination.page + 1)}
                className={`px-3 py-1 border border-zinc-800 uppercase tracking-wider text-xs transition ${
                  pagination.hasNextPage
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

      <TaskSlideOverDrawer
        task={selectedTask}
        open={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false)
          setSelectedTask(null)
        }}
        canEdit={canEdit}
        assignees={assignees}
        onTaskUpdated={handleTaskUpdated}
      />
    </>
  )
}
