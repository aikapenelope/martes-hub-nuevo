'use client'

import { useRef, useState, useTransition, type DragEvent } from 'react'
import { Clock3, GripVertical, Plus, UserRound } from 'lucide-react'
import type { Task, User } from '@/payload-types'
import {
  checklistProgress,
  dueState,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks-filters'
import { createTaskInSituAction, updateTaskStatusAction } from '@/lib/tasks-actions'
import { TaskStatusSelect } from '@/components/workspace/TaskStatusSelect'
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

export interface TaskColumn {
  status: TaskStatus
  total: number
  tasks: Task[]
}

interface TasksKanbanBoardProps {
  initialColumns: TaskColumn[]
  canEdit: boolean
  assignees?: User[]
}

export function TasksKanbanBoard({
  initialColumns,
  canEdit,
  assignees = [],
}: TasksKanbanBoardProps) {
  const [columns, setColumns] = useState<TaskColumn[]>(initialColumns)
  const [prevInitialColumns, setPrevInitialColumns] = useState(initialColumns)
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const nextTempIdRef = useRef(-1)

  // Estado para el Slide-Over Drawer
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Estado para la creación rápida in-situ (Linear-style)
  const [activeInlineColumn, setActiveInlineColumn] = useState<TaskStatus | null>(null)
  const [inlineTitle, setInlineTitle] = useState('')
  const [inlinePriority, setInlinePriority] = useState<TaskPriority>('media')

  // Sincronizar si cambian los datos de servidor por filtros
  if (initialColumns !== prevInitialColumns) {
    setPrevInitialColumns(initialColumns)
    setColumns(initialColumns)
  }

  function handleTaskUpdated(updatedTask: Task) {
    setColumns((prev) =>
      prev.map((col) => {
        const hasTask = col.tasks.some((t) => t.id === updatedTask.id)
        if (col.status === updatedTask.status) {
          if (hasTask) {
            return {
              ...col,
              tasks: col.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
            }
          } else {
            return {
              ...col,
              tasks: [updatedTask, ...col.tasks],
              total: col.total + 1,
            }
          }
        } else {
          if (hasTask) {
            return {
              ...col,
              tasks: col.tasks.filter((t) => t.id !== updatedTask.id),
              total: Math.max(0, col.total - 1),
            }
          }
          return col
        }
      }),
    )
    if (selectedTask?.id === updatedTask.id) {
      setSelectedTask(updatedTask)
    }
  }

  function handleInlineCreate(columnStatus: TaskStatus) {
    const trimmed = inlineTitle.trim()
    if (!trimmed || !canEdit || isPending) return

    const tempId = nextTempIdRef.current--
    const optimisticTask: Task = {
      id: tempId,
      title: trimmed,
      status: columnStatus,
      priority: inlinePriority,
      checklist: [],
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Task

    setColumns((prev) =>
      prev.map((col) =>
        col.status === columnStatus
          ? {
              ...col,
              tasks: [...col.tasks, optimisticTask],
              total: col.total + 1,
            }
          : col,
      ),
    )

    setInlineTitle('')

    startTransition(async () => {
      const res = await createTaskInSituAction({
        title: trimmed,
        status: columnStatus,
        priority: inlinePriority,
      })

      if (!res.ok) {
        setError(res.error)
        setColumns((prev) =>
          prev.map((col) =>
            col.status === columnStatus
              ? {
                  ...col,
                  tasks: col.tasks.filter((t) => t.id !== tempId),
                  total: Math.max(0, col.total - 1),
                }
              : col,
          ),
        )
      } else {
        setColumns((prev) =>
          prev.map((col) =>
            col.status === columnStatus
              ? {
                  ...col,
                  tasks: col.tasks.map((t) => (t.id === tempId ? res.task : t)),
                }
              : col,
          ),
        )
      }
    })
  }

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
        {columns.map((column) => {
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

              <div className="flex flex-1 flex-col gap-2 p-2 min-h-[14rem]">
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
                        draggable={canEdit && task.id > 0}
                        onDragStart={(e: DragEvent<HTMLElement>) => {
                          if (!canEdit || task.id <= 0) return
                          e.dataTransfer.setData('text/plain', String(task.id))
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingTaskId(task.id)
                        }}
                        onDragEnd={() => {
                          setDraggingTaskId(null)
                          setDragOverStatus(null)
                        }}
                        onClick={() => {
                          if (task.id > 0) {
                            setSelectedTask(task)
                            setIsDrawerOpen(true)
                          }
                        }}
                        className={`oled-card p-3 transition-all duration-150 relative group cursor-pointer hover:border-zinc-700 ${
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
                              className="mt-0.5 text-zinc-600 group-hover:text-zinc-400 transition shrink-0 cursor-grab active:cursor-grabbing"
                              title="Arrastra para mover de columna"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical size={13} />
                            </span>
                          )}
                          <span className="block text-sm font-semibold text-white group-hover:text-sky-300 transition truncate flex-1">
                            {task.title}
                          </span>
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
                              className="mt-1 h-1 w-full accent-sky-400 bg-zinc-850 rounded"
                            />
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
                          <span className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono truncate">
                            <UserRound size={13} className="shrink-0" />
                            {person(task.assignedTo)}
                          </span>
                          {canEdit && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <TaskStatusSelect
                                taskId={task.id}
                                status={task.status}
                                label={`Cambiar estado de ${task.title}`}
                              />
                            </div>
                          )}
                        </div>
                      </article>
                    )
                  })
                )}

                {/* Creación rápida in-situ estilo Linear al fondo de la columna */}
                {canEdit && (
                  <div className="mt-auto pt-2 border-t border-zinc-850/60">
                    {activeInlineColumn === column.status ? (
                      <div className="border border-zinc-700 bg-zinc-950 p-2.5 space-y-2 shadow-lg rounded">
                        <input
                          type="text"
                          value={inlineTitle}
                          onChange={(e) => setInlineTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleInlineCreate(column.status)
                            } else if (e.key === 'Escape') {
                              setActiveInlineColumn(null)
                              setInlineTitle('')
                            }
                          }}
                          placeholder="Escribe el título y presiona Enter..."
                          autoFocus
                          className="w-full bg-black border border-zinc-800 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
                        />
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            {TASK_PRIORITIES.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setInlinePriority(p)}
                                className={`px-1.5 py-0.5 text-[9px] font-mono border transition ${
                                  inlinePriority === p
                                    ? `${priorityCls[p]} ring-1 ring-white/20 font-bold`
                                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                }`}
                              >
                                {priorityLabel[p]}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveInlineColumn(null)
                                setInlineTitle('')
                              }}
                              className="px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={!inlineTitle.trim() || isPending}
                              onClick={() => handleInlineCreate(column.status)}
                              className="px-2.5 py-1 text-[10px] font-mono bg-white text-black font-bold hover:bg-zinc-200 disabled:opacity-40"
                            >
                              {isPending ? 'Creando...' : 'Crear'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveInlineColumn(column.status)
                          setInlineTitle('')
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60 border border-dashed border-zinc-800 hover:border-zinc-700 transition rounded"
                      >
                        <Plus size={13} />
                        <span>Añadir tarea</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </section>

      {/* Slide-Over Drawer para inspección y edición ágil */}
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
    </div>
  )
}
