'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { WorkspaceRole } from '@/lib/workspace-context'

const VALID_ROLES: WorkspaceRole[] = ['admin', 'agente', 'viewer']

/**
 * Invita a un miembro del equipo — antes solo se podía crear un usuario
 * desde `/admin`. Asigna el tenant activo automáticamente (Users no tiene
 * `tenant` plano; usa el array `tenants` que inyecta el plugin multi-tenant).
 * El usuario nuevo puede cambiar la contraseña temporal desde el login
 * ("¿Olvidaste tu contraseña?" — flujo nativo de Payload, no se reconstruye aquí).
 */
export async function inviteUserAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) throw new Error('Solo un admin puede invitar usuarios')

  const email = formData.get('email')
  const password = formData.get('password')
  if (typeof email !== 'string' || !email.trim()) throw new Error('El email es obligatorio')
  if (typeof password !== 'string' || password.length < 8) throw new Error('La contraseña temporal debe tener al menos 8 caracteres')

  const firstName = formData.get('firstName')
  const lastName = formData.get('lastName')
  const roles = formData.getAll('roles').filter((r): r is string => typeof r === 'string' && VALID_ROLES.includes(r as WorkspaceRole))
  if (roles.length === 0) throw new Error('Selecciona al menos un rol')

  await context.payload.create({
    collection: 'users',
    overrideAccess: false,
    user: context.user,
    data: {
      email: email.trim().toLowerCase(),
      password,
      firstName: typeof firstName === 'string' && firstName.trim() ? firstName.trim().slice(0, 100) : undefined,
      lastName: typeof lastName === 'string' && lastName.trim() ? lastName.trim().slice(0, 100) : undefined,
      roles: roles as WorkspaceRole[],
      active: true,
      tenants: [{ tenant: context.tenantId }],
    },
  })

  revalidatePath('/workspace/team')
}

/** Activa/desactiva a un miembro del equipo. */
export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) throw new Error('Solo un admin puede activar/desactivar usuarios')

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador inválido')
  const active = formData.get('active') === 'true'

  if (id === context.user.id) throw new Error('No puedes desactivarte a ti mismo')

  await context.payload.update({
    collection: 'users',
    id,
    overrideAccess: false,
    user: context.user,
    data: { active },
  })

  revalidatePath('/workspace/team')
}
