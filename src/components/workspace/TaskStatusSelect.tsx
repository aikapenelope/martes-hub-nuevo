'use client'

import { useRef } from 'react'

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
 * la Server Action `changeTaskStatusAction` (hidden input `id` + `status`).
 *
 * El `name="status"` NO va en el Select de Radix: su hidden select se
 * actualiza en el re-render DESPUÉS de `onValueChange`, así que un submit
 * inmediato leería el valor VIEJO (review Devin). En su lugar escribimos
 * directamente nuestro hidden input (sincrónico) y recién submitimos.
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
	const formRef = useRef<HTMLFormElement>(null)
	const statusRef = useRef<HTMLInputElement>(null)

	return (
		<form ref={formRef} action={changeTaskStatusAction}>
			<input type="hidden" name="id" value={taskId} />
			<input type="hidden" name="status" defaultValue={status} ref={statusRef} />
			<Select
				defaultValue={status}
				disabled={disabled}
				onValueChange={(value) => {
					if (statusRef.current) statusRef.current.value = value
					formRef.current?.requestSubmit()
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
