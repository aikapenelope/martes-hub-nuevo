'use client'

import { Plus } from 'lucide-react'

import { inviteUserAction } from '@/lib/team-actions'
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
import { FormCheckbox } from '@/components/workspace/form-checkbox'

const labelCls = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

/** Reemplaza crear un usuario desde `/admin/collections/users/create`. Solo admins (gateado por el caller). */
export function InviteUserDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus /> Invitar
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Invitar Miembro al Equipo</DialogTitle>
					<DialogDescription>
						Comparte la contraseña temporal por un canal seguro. El nuevo usuario puede cambiarla desde
						&quot;¿Olvidaste tu contraseña?&quot; en el login.
					</DialogDescription>
				</DialogHeader>
				<form action={inviteUserAction} className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="invite-first-name" className={labelCls}>
								Nombre
							</Label>
							<Input id="invite-first-name" name="firstName" maxLength={100} />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="invite-last-name" className={labelCls}>
								Apellido
							</Label>
							<Input id="invite-last-name" name="lastName" maxLength={100} />
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-email" className={labelCls}>
							Email
						</Label>
						<Input id="invite-email" name="email" type="email" required />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="invite-password" className={labelCls}>
							Contraseña temporal (mín. 8 caracteres)
						</Label>
						<Input id="invite-password" name="password" type="text" required minLength={8} />
					</div>
					<fieldset className="space-y-2">
						<legend className={labelCls}>Roles</legend>
						<div className="flex flex-col gap-2 text-xs">
							<label htmlFor="invite-role-admin" className="flex cursor-pointer items-center gap-2">
								<FormCheckbox id="invite-role-admin" name="roles" value="admin" />
								Admin — gestiona todo
							</label>
							<label htmlFor="invite-role-agente" className="flex cursor-pointer items-center gap-2">
								<FormCheckbox id="invite-role-agente" name="roles" value="agente" defaultChecked />
								Agente — opera CRM
							</label>
							<label htmlFor="invite-role-viewer" className="flex cursor-pointer items-center gap-2">
								<FormCheckbox id="invite-role-viewer" name="roles" value="viewer" />
								Viewer — solo lectura
							</label>
						</div>
					</fieldset>
					<DialogFooter>
						<Button type="submit">Crear usuario</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
