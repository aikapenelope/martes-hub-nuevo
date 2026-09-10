'use client'

import { changeMembershipStatusAction } from '@/lib/membership-actions'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'

/**
 * Select de cambio de estado de membresía (shadcn/Radix). Client Component
 * porque el auto-submit necesita `onValueChange` — la mutación la ejecuta la
 * Server Action de memberships (hidden input `id` + `status` del Select).
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
	const options: Array<{ value: string; label: string }> = [
		{ value: 'activa', label: 'Activa' },
		{ value: 'pausada', label: 'Pausada' },
		{ value: 'vencida', label: 'Vencida' },
		{ value: 'cancelada', label: 'Cancelada' },
	]

	return (
		<form
			action={changeMembershipStatusAction}
			data-membership-id={membershipId}
		>
			<input type="hidden" name="id" value={membershipId} />
			<Select
				name="status"
				defaultValue={status}
				onValueChange={() => {
					// Auto-submit cuando el hidden select de Radix ya tiene el valor NUEVO.
					document
						.querySelector<HTMLFormElement>(`form[data-membership-id="${membershipId}"]`)
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
