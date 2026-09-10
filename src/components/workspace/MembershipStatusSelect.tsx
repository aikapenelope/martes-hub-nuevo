'use client'

import { useRef } from 'react'

import { changeMembershipStatusAction } from '@/lib/membership-actions'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'

/**
 * Select de cambio de estado de membresía (shadcn/Radix). Client Component:
 * el auto-submit necesita `onValueChange` — la mutación la ejecuta la Server
 * Action de memberships (hidden inputs `id` + `status`).
 *
 * El `name="status"` NO va en el Select de Radix: su hidden select se
 * actualiza en el re-render DESPUÉS de `onValueChange`, así que un submit
 * inmediato leería el valor VIEJO (misma clase de bug que la review Devin
 * marcó en TaskStatusSelect). Escribimos nuestro hidden input directo
 * (sincrónico) y recién submitimos.
 */
export function MembershipStatusSelect({
	membershipId,
	status,
	label,
}: {
	membershipId: number
	status: string
	label: string
}) {
	const formRef = useRef<HTMLFormElement>(null)
	const statusRef = useRef<HTMLInputElement>(null)

	const options: Array<{ value: string; label: string }> = [
		{ value: 'activa', label: 'Activa' },
		{ value: 'pausada', label: 'Pausada' },
		{ value: 'vencida', label: 'Vencida' },
		{ value: 'cancelada', label: 'Cancelada' },
	]

	return (
		<form ref={formRef} action={changeMembershipStatusAction}>
			<input type="hidden" name="id" value={membershipId} />
			<input type="hidden" name="status" defaultValue={status} ref={statusRef} />
			<Select
				defaultValue={status}
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
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</form>
	)
}
