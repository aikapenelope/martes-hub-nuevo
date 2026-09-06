'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  CheckSquare,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  Square,
  UserRound,
  FileText,
} from 'lucide-react'

import { Drawer } from '@/components/workspace/overlays'
import {
  addChecklistItemInSituAction,
  toggleChecklistInSituAction,
  updateTaskInSituAction,
} from '@/lib/tasks-actions'
import {
  checklistProgress,
  dueState,
  formatTaskDueDate,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks-filters'
import type { Task, User } from '@/payload-types'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const statusBadgeCls: Record<TaskStatus, string> = {
  pendiente: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  en_progreso: 'border-sky-800 bg-sky-950/50 text-sky-300',
  bloqueada: 'border-amber-800 bg-amber-950/50 text-amber-300',
  completada: 'border-emerald-800 bg-emerald-950/50 text-emerald-300',
  cancelada: 'border-zinc-800 bg-zinc-950 text-zinc-500 line-through',
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

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition font-mono'

interface TaskSlideOverDrawerProps {
  task: Task | null
  open: boolean
  onClose: () => void
  canEdit?: boolean
  assignees?: User[]
  onTaskUpdated?: (updatedTask: Task) => void
}

export function TaskSlideOverDrawer({
  task,
  open,
  onClose,
  canEdit = true,
  assignees = [],
  onTaskUpdated,
}: TaskSlideOverDrawerProps) {
  const [currentTask, setCurrentTask] = useState<Task | null>(task)
  const [newSubtask, setNewSubtask] = useState('')
  const [descriptionValue, setDescriptionValue] = useState(task?.description ?? '')
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Sincronizar si cambia la tarea seleccionada
  if (task && currentTask?.id !== task.id) {
    setCurrentTask(task)
    setDescriptionValue(task.description ?? '')
    setIsEditingDesc(false)
    setError(null)
  }

  if (!currentTask) return null

  const activeTask = currentTask
  const progress = checklistProgress(activeTask.checklist)
  const due = dueState(activeTask.dueDate)

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (!canEdit || isPending || activeTask.status === newStatus) return
    setError(null)

    const optimistic = { ...activeTask, status: newStatus }
    setCurrentTask(optimistic)
    onTaskUpdated?.(optimistic)

    startTransition(async () => {
      const res = await updateTaskInSituAction({ taskId: activeTask.id, status: newStatus })
      if (!res.ok) {
        setError(res.error)
        setCurrentTask(activeTask)
        onTaskUpdated?.(activeTask)
      } else {
        setCurrentTask(res.task)
        onTaskUpdated?.(res.task)
      }
    })
  }

  const handlePriorityChange = (newPriority: TaskPriority) => {
    if (!canEdit || isPending || activeTask.priority === newPriority) return
    setError(null)

    const optimistic = { ...activeTask, priority: newPriority }
    setCurrentTask(optimistic)
    onTaskUpdated?.(optimistic)

    startTransition(async () => {
      const res = await updateTaskInSituAction({ taskId: activeTask.id, priority: newPriority })
      if (!res.ok) {
        setError(res.error)
        setCurrentTask(activeTask)
        onTaskUpdated?.(activeTask)
      } else {
        setCurrentTask(res.task)
        onTaskUpdated?.(res.task)
      }
    })
  }

  const handleToggleChecklist = (index: number) => {
    if (!canEdit || isPending) return
    setError(null)

    const prevChecklist = activeTask.checklist ?? []
    const updatedChecklist = prevChecklist.map((item, i) =>
      i === index ? { item: item.item, done: !item.done } : item,
    )
    const optimistic = { ...activeTask, checklist: updatedChecklist }
    setCurrentTask(optimistic)
    onTaskUpdated?.(optimistic)

    startTransition(async () => {
      const res = await toggleChecklistInSituAction({ taskId: activeTask.id, index })
      if (!res.ok) {
        setError(res.error)
        setCurrentTask(activeTask)
        onTaskUpdated?.(activeTask)
      } else {
        const next = { ...activeTask, checklist: res.checklist }
        setCurrentTask(next)
        onTaskUpdated?.(next)
      }
    })
  }

  const handleAddSubtask = (e: FormEvent) => {
    e.preventDefault()
    if (!canEdit || !newSubtask.trim() || isPending) return
    const text = newSubtask.trim()
    setNewSubtask('')
    setError(null)

    startTransition(async () => {
      const res = await addChecklistItemInSituAction({ taskId: activeTask.id, item: text })
      if (!res.ok) {
        setError(res.error)
      } else {
        const next = { ...activeTask, checklist: res.checklist }
        setCurrentTask(next)
        onTaskUpdated?.(next)
      }
    })
  }

  const handleSaveDescription = () => {
    if (!canEdit || isPending) return
    setError(null)

    startTransition(async () => {
      const res = await updateTaskInSituAction({
        taskId: activeTask.id,
        description: descriptionValue,
      })
      if (!res.ok) {
        setError(res.error)
      } else {
        setCurrentTask(res.task)
        onTaskUpdated?.(res.task)
        setIsEditingDesc(false)
      }
    })
  }

  const handleAssigneeChange = (userId: string) => {
    if (!canEdit || isPending) return
    const assignedTo = userId ? Number(userId) : null
    setError(null)

    startTransition(async () => {
      const res = await updateTaskInSituAction({ taskId: activeTask.id, assignedTo })
      if (!res.ok) {
        setError(res.error)
      } else {
        setCurrentTask(res.task)
        onTaskUpdated?.(res.task)
      }
    })
  }

  const clientName =
    activeTask.client && typeof activeTask.client === 'object' ? activeTask.client.name : null
  const leadName =
    activeTask.lead && typeof activeTask.lead === 'object' ? activeTask.lead.fullName : null
  const assigneeUser =
    activeTask.assignedTo && typeof activeTask.assignedTo === 'object'
      ? activeTask.assignedTo
      : null

  return (
    <Drawer open={open} onClose={onClose} size="xl" title={activeTask.title}>
      <div className="flex flex-col gap-5 pb-6">
        {/* Barra superior con atajo a página completa y badge */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
            <span>Centro de Ejecución Ágil · Tarea #{activeTask.id}</span>
          </div>

          <Link
            href={`/workspace/tasks/${activeTask.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 bg-zinc-900 px-2.5 py-1 rounded transition"
          >
            <span>Ver página completa</span>
            <ExternalLink size={12} />
          </Link>
        </div>

        {error && (
          <div className="border border-red-800 bg-red-950/40 p-2.5 text-xs font-mono text-red-300">
            {error}
          </div>
        )}

        {/* Título de la tarea con badge de estado */}
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">{activeTask.title}</h1>
        </div>

        {/* Selector de Estado Rápido */}
        <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Estado de Avance
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {TASK_STATUSES.map((status) => {
              const isSelected = activeTask.status === status
              return (
                <button
                  key={status}
                  type="button"
                  disabled={!canEdit || isPending}
                  onClick={() => handleStatusChange(status)}
                  className={`px-2 py-1.5 text-center text-xs font-mono border transition-all ${
                    isSelected
                      ? `${statusBadgeCls[status]} ring-1 ring-white/20 font-bold`
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {statusLabel[status]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selector de Prioridad y Metadatos Clave */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Nivel de Prioridad
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TASK_PRIORITIES.map((p) => {
                const isSelected = activeTask.priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={!canEdit || isPending}
                    onClick={() => handlePriorityChange(p)}
                    className={`px-2 py-1 text-center text-[10px] font-mono font-medium border transition-all ${
                      isSelected
                        ? `${priorityCls[p]} ring-1 ring-white/20 font-bold`
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    {priorityLabel[p]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Responsable
            </span>
            {canEdit && assignees.length > 0 ? (
              <select
                value={
                  typeof activeTask.assignedTo === 'object' && activeTask.assignedTo
                    ? String(activeTask.assignedTo.id)
                    : typeof activeTask.assignedTo === 'number'
                      ? String(activeTask.assignedTo)
                      : ''
                }
                onChange={(e) => handleAssigneeChange(e.target.value)}
                disabled={isPending}
                className={inputCls}
              >
                <option value="">Sin asignar (Equipo)</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono py-1">
                <UserRound size={13} className="text-zinc-500" />
                <span>
                  {assigneeUser
                    ? `${assigneeUser.firstName ?? ''} ${assigneeUser.lastName ?? ''}`.trim() ||
                      assigneeUser.email
                    : 'Sin asignar'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Relación CRM y Fecha Límite */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-zinc-850 bg-zinc-950 p-3 flex flex-col gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Link2 size={12} />
              Contexto CRM
            </span>
            {clientName ? (
              <Link
                href={`/workspace/crm/clientes/${typeof activeTask.client === 'object' ? activeTask.client?.id : activeTask.client}`}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:underline"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Cliente: {clientName}
              </Link>
            ) : leadName ? (
              <Link
                href={`/workspace/crm/leads/${typeof activeTask.lead === 'object' ? activeTask.lead?.id : activeTask.lead}`}
                className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-400 hover:underline"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                Lead: {leadName}
              </Link>
            ) : (
              <span className="text-xs text-zinc-600 font-mono">Sin relación comercial</span>
            )}
          </div>

          <div className="border border-zinc-850 bg-zinc-950 p-3 flex flex-col gap-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Clock3 size={12} />
              Vencimiento
            </span>
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span
                className={
                  due === 'overdue'
                    ? 'text-red-400 font-bold'
                    : due === 'today'
                      ? 'text-amber-300 font-bold'
                      : 'text-zinc-300'
                }
              >
                {formatTaskDueDate(activeTask.dueDate, {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {due === 'overdue' && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 border border-red-800 text-red-300 font-bold">
                  Vencida
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Checklist de Subtareas Interactivas */}
        <div className="border border-zinc-850 bg-zinc-950 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
            <div className="flex items-center gap-2">
              <CheckSquare size={14} className="text-sky-400" />
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Checklist de Ejecución
              </h3>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              {progress.done} de {progress.total} ({progress.percent}%)
            </span>
          </div>

          {progress.total > 0 && (
            <progress
              max="100"
              value={progress.percent}
              aria-label={`Progreso del checklist: ${progress.done} de ${progress.total}`}
              className="h-1.5 w-full accent-sky-400 bg-zinc-850 rounded"
            />
          )}

          <div className="flex flex-col divide-y divide-zinc-900">
            {(activeTask.checklist ?? []).map((subtask, index) => {
              const isDone = Boolean(subtask.done)
              return (
                <div
                  key={index}
                  onClick={() => handleToggleChecklist(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleToggleChecklist(index)}
                  className={`flex items-center gap-2.5 py-2 px-1 text-xs font-mono cursor-pointer transition select-none hover:bg-zinc-900/40 ${
                    isDone ? 'text-zinc-500 line-through' : 'text-zinc-200'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  ) : (
                    <Square size={15} className="text-zinc-500 shrink-0" />
                  )}
                  <span className="flex-1">{subtask.item}</span>
                </div>
              )
            })}
          </div>

          {canEdit && (
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="+ Añadir subtarea y presionar Enter..."
                className="flex-1 border border-zinc-800 bg-black px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                type="submit"
                disabled={!newSubtask.trim() || isPending}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-mono font-bold transition disabled:opacity-40"
              >
                Añadir
              </button>
            </form>
          )}
        </div>

        {/* Descripción / Notas de la tarea */}
        <div className="border border-zinc-850 bg-zinc-950 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <FileText size={13} />
              Notas e Instrucciones
            </span>
            {canEdit && !isEditingDesc && (
              <button
                type="button"
                onClick={() => setIsEditingDesc(true)}
                className="text-[10px] font-mono text-sky-400 hover:underline"
              >
                Editar
              </button>
            )}
          </div>

          {isEditingDesc ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Detalles sobre la tarea..."
                className={inputCls}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDescriptionValue(activeTask.description ?? '')
                    setIsEditingDesc(false)
                  }}
                  className="px-3 py-1 text-xs font-mono border border-zinc-800 text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSaveDescription}
                  className="px-3 py-1 text-xs font-mono bg-white text-black font-bold hover:bg-zinc-200"
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed py-1">
              {activeTask.description || (
                <span className="text-zinc-600 font-mono italic">Sin notas detalladas.</span>
              )}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4 mt-1">
          <span className="text-[11px] font-mono text-zinc-500">
            {isPending ? (
              <span className="inline-flex items-center gap-1 text-sky-400">
                <Loader2 size={11} className="animate-spin" />
                Actualizando tarea...
              </span>
            ) : (
              'Cambios guardados en tiempo real'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono transition"
          >
            Cerrar panel
          </button>
        </div>
      </div>
    </Drawer>
  )
}
