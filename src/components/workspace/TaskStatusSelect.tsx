'use client'

import { changeTaskStatusAction } from '@/lib/tasks-actions'
import { TASK_STATUSES, type TaskStatus } from '@/lib/tasks-filters'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

/**
 * Select de cambio de estado de tarea (shadcn/Radix). Debe ser un Client
 * Component: el auto-submit necesita `onValueChange` — la mutación la ejecuta
 * la Server Action `changeTaskStatusAction` (hidden input `id` + `status` del
 * Select con `name`, misma fuente de verdad que el resto del workspace).
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
    <form action={changeTaskStatusAction} data-task-id={taskId}>
      <input type="hidden" name="id" value={taskId} />
      <Select
        name="status"
        defaultValue={status}
        disabled={disabled}
        onValueChange={() => {
          // Auto-submit cuando el hidden select de Radix ya tiene el valor NUEVO.
          document
            .querySelector<HTMLFormElement>(`form[data-task-id="${taskId}"]`)
            ?.requestSubmit()
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="h-auto w-fit border-none bg-transparent px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground focus-visible:ring-0"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {statusLabel[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  )
}
