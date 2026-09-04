'use client'

import { useState, useTransition, type DragEvent } from 'react'
import Link from 'next/link'
import { Clock3, GripVertical, UserRound } from 'lucide-react'
import type { Task, User } from '@/payload-types'
import {
  checklistProgress,
  dueState,
  type TaskStatus,
} from '@/lib/tasks-filters'
import { updateTaskStatusAction } from '@/lib/tasks-actions'
import { TaskStatusSelect } from '@/components/workspace/TaskStatusSelect'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const priorityLabel = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' }
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

export interface TaskColumn {
  status: TaskStatus
  total: number
  tasks: Task[]
}

interface TasksKanbanBoardProps {
  initialColumns: TaskColumn[]
  canEdit: boolean
}

export function TasksKanbanBoard({ initialColumns, canEdit }: TasksKanbanBoardProps) {
  const [columns, setColumns] = useState<TaskColumn[]>(initialColumns)
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Sincronizar si initialColumns cambia desde el server component
  // (ej. tras aplicar filtros o recargar datos)
  const columnsToRender = columns

  function moveTask(taskId: number, newStatus: TaskStatus): void {
    if (!canEdit) return
    setError(null)
    setDragOverStatus(null)
    setDraggingTaskId(null)

    const previousColumns = columns

    let movedTask: Task | undefined
    const withoutTask = columns.map((col) => {
      const found = col.tasks.find((t) => t.id === taskId)
      if (found) movedTask = found
      return {
        ...col,
        tasks: col.tasks.filter((t) => t.id !== taskId),
      }
    })

    if (!movedTask || movedTask.status === newStatus) return

    const updatedTask: Task = { ...movedTask, status: newStatus }
    const nextColumns = withoutTask.map((col) =>
      col.status === newStatus
        ? {
            ...col,
            tasks: [updatedTask, ...col.tasks],
            total: col.tasks.length + 1,
          }
        : {
            ...col,
            total: col.tasks.length,
          },
    )

    setColumns(nextColumns)

    startTransition(() => {
      void updateTaskStatusAction(taskId, newStatus).then((res) => {
        if (!res.ok) {
          setError(res.error)
          setColumns(previousColumns)
        }
      })
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300 font-mono"
          role="alert"
        >
          {error}
        </div>
      )}

      <section
        className="grid gap-3 lg:grid-cols-5"
        aria-label="Tablero Kanban de Tareas interactivo"
      >
        {columnsToRender.map((column) => {
          const isTarget = dragOverStatus === column.status
          return (
            <section
              key={column.status}
              className={`oled-card flex flex-col transition-all duration-150 ${
                isTarget
                  ? 'kanban-column-drop-active shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1 ring-sky-500/50'
                  : ''
              }`}
              onDragOver={(e) => {
                if (canEdit) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverStatus !== column.status) setDragOverStatus(column.status)
                }
              }}
              onDragLeave={(e) => {
                // Prevenir falsos positivos al pasar por hijos de la columna
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (dragOverStatus === column.status) setDragOverStatus(null)
                }
              }}
              onDrop={(e) => {
                if (!canEdit) return
                e.preventDefault()
                setDragOverStatus(null)
                const rawId = Number(e.dataTransfer.getData('text/plain'))
                if (Number.isInteger(rawId) && rawId > 0) {
                  moveTask(rawId, column.status)
                }
              }}
            >
              <header className="flex items-center gap-2 border-b border-zinc-800 p-3 bg-zinc-950/60">
                <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                <h2 className="flex-1 text-xs font-bold text-white uppercase tracking-wider">
                  {statusLabel[column.status]}
                </h2>
                <span className="text-xs font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 border border-zinc-800">
                  {column.total}
                </span>
              </header>

              <div className="flex flex-1 flex-col gap-2 p-2 min-h-[12rem]">
                {/* Indicador visual cuando se arrastra sobre la columna */}
                {isTarget && (
                  <div className="border border-dashed border-sky-400/60 bg-sky-950/20 py-3 text-center text-[10px] font-mono uppercase tracking-wider text-sky-300 rounded transition-all animate-pulse">
                    Soltar aquí para marcar como {statusLabel[column.status]}
                  </div>
                )}

                {column.tasks.length === 0 && !isTarget ? (
                  <p className="p-6 text-center text-xs text-zinc-600 font-mono">Sin tareas</p>
                ) : (
                  column.tasks.map((task) => {
                    const isBeingDragged = draggingTaskId === task.id
                    const progress = checklistProgress(task.checklist)
                    const due = dueState(task.dueDate)

                    return (
                      <article
                        key={task.id}
                        draggable={canEdit}
                        onDragStart={(e: DragEvent<HTMLElement>) => {
                          if (!canEdit) return
                          e.dataTransfer.setData('text/plain', String(task.id))
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingTaskId(task.id)
                        }}
                        onDragEnd={() => {
                          setDraggingTaskId(null)
                          setDragOverStatus(null)
                        }}
                        className={`oled-card p-3 transition-all duration-150 relative group ${
                          canEdit ? 'cursor-grab active:cursor-grabbing hover:border-zinc-700' : ''
                        } ${
                          isBeingDragged
                            ? 'opacity-30 scale-[0.97] border-sky-400/80 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 ${
                              priorityCls[task.priority]
                            }`}
                          >
                            {priorityLabel[task.priority]}
                          </span>
                          <span
                            className={`flex items-center gap-1 text-[10px] font-mono ${dueCls[due]}`}
                          >
                            <Clock3 size={12} />
                            {dateLabel(task.dueDate)}
                          </span>
                        </div>

                        <div className="mt-2 flex items-start gap-1.5">
                          {canEdit && (
                            <span
                              className="mt-0.5 text-zinc-600 group-hover:text-zinc-400 transition shrink-0"
                              title="Arrastra para mover de columna"
                            >
                              <GripVertical size={13} />
                            </span>
                          )}
                          <Link
                            href={`/workspace/tasks/${task.id}`}
                            className="block text-sm font-semibold text-white hover:text-sky-300 hover:underline transition truncate"
                          >
                            {task.title}
                          </Link>
                        </div>

                        <p className="mt-1 text-xs text-zinc-500 font-mono truncate">
                          {relation(task)}
                        </p>

                        {progress.total > 0 && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                              <span>
                                {progress.done}/{progress.total} subtareas
                              </span>
                              <span>{progress.percent}%</span>
                            </div>
                            <progress
                              max="100"
                              value={progress.percent}
                              aria-label={`Progreso del checklist: ${progress.done} de ${progress.total} (${progress.percent}%)`}
                              className="mt-1 h-1 w-full accent-white"
                            />
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
                          <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono truncate">
                            <UserRound size={13} className="shrink-0" />
                            {person(task.assignedTo)}
                          </span>
                          {canEdit && (
                            <TaskStatusSelect
                              taskId={task.id}
                              status={task.status}
                              label={`Cambiar estado de ${task.title}`}
                            />
                          )}
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </section>
    </div>
  )
}
