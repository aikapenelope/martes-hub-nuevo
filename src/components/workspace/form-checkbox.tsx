'use client'

import { useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'

/**
 * Checkbox de formulario: Radix NO envía su valor en forms nativos/server
 * actions — este wrapper sincroniza un hidden input solo cuando está
 * marcado. `value` omitido = 'on' (contrato clásico de checkbox nativo);
 * con `value` (ej. roles multi-select) cada opción marcada envía su valor.
 */
export function FormCheckbox({
	name,
	value,
	defaultChecked = false,
	onCheckedChange,
	id,
	className,
}: {
	name: string
	value?: string
	defaultChecked?: boolean
	onCheckedChange?: (checked: boolean) => void
	id?: string
	className?: string
}) {
	const [checked, setChecked] = useState(defaultChecked)

	return (
		<>
			<Checkbox
				id={id}
				className={className}
				checked={checked}
				onCheckedChange={(v) => {
					setChecked(v === true)
					onCheckedChange?.(v === true)
				}}
			/>
			{checked && <input type="hidden" name={name} value={value ?? 'on'} />}
		</>
	)
}
