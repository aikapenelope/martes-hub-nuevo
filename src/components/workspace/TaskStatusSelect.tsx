'use client'

import { TASK_STATUSES, type TaskStatus } from '@/lib/tasks-filters'
import { changeTaskStatusAction } from '@/lib/tasks-actions'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

/**
 * `<select>` de cambio de estado de tarea. Debe ser un Client Component:
 * un Server Component no puede pasar event handlers (`onChange`) a JSX.
 * Recibe solo props serializables y delega la mutación en la Server Action
 * `changeTaskStatusAction` (misma fuente de verdad que el resto del workspace).
 */
export function TaskStatusSelect({
  taskId,
  status,
  label,
  disabled = false,
}: {
  taskId: number
  status: TaskStatus
  label: string
  disabled?: boolean
}) {
  return (
    <form action={changeTaskStatusAction}>
      <input type="hidden" name="id" value={taskId} />
      <select
        name="status"
        defaultValue={status}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="border border-zinc-800 bg-black px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono uppercase disabled:cursor-not-allowed disabled:opacity-60"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel[s]}
          </option>
        ))}
      </select>
    </form>
  )
}