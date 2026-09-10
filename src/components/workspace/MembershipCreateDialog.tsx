'use client'

import { Plus, RefreshCw } from 'lucide-react'

import { createMembershipAction } from '@/lib/membership-actions'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { Client } from '@/payload-types'

/** Reemplaza el link a `/admin/collections/memberships/create` (que ni siquiera existía en el workspace). */
export function MembershipCreateDialog({ clients }: { clients: Client[] }) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm">
					<RefreshCw /> Membresía
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Nueva Membresía</DialogTitle>
					<DialogDescription>
						{clients.length === 0
							? 'No hay clientes en este tenant todavía. Crea uno primero desde el CRM.'
							: 'Plan recurrente con renovación en 1 clic al vencer.'}
					</DialogDescription>
				</DialogHeader>
				{clients.length > 0 && (
					<form action={createMembershipAction} className="flex flex-col gap-4">
						<div className="space-y-1.5">
							<Label htmlFor="membership-client" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
								Cliente
							</Label>
							<Select name="client" required>
								<SelectTrigger id="membership-client" className="w-full">
									<SelectValue placeholder="Selecciona un cliente" />
								</SelectTrigger>
								<SelectContent>
									{clients.map((c) => (
										<SelectItem key={c.id} value={String(c.id)}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="membership-plan" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
								Plan
							</Label>
							<Input id="membership-plan" name="plan" required maxLength={160} placeholder="Ej: Web básica, CRM + Redes" />
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="membership-price" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
									Precio mensual (USD)
								</Label>
								<Input id="membership-price" name="monthlyPrice" type="number" min={0.01} step={0.01} required />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="membership-start" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
									Inicio
								</Label>
								<Input
									id="membership-start"
									name="startDate"
									type="date"
									required
									defaultValue={new Date().toISOString().slice(0, 10)}
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="membership-renewal" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
								Próxima renovación
							</Label>
							<Input id="membership-renewal" name="renewalDate" type="date" required />
						</div>
						<DialogFooter>
							<Button type="submit">
								<Plus /> Guardar membresía
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	)
}
