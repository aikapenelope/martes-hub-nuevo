'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { wholeUsd } from '@/lib/money'

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function requiredNumericId(formData: FormData, key: string): number {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Selecciona un valor válido para ${key}`)
  return value
}

/**
 * Crea una membresía desde el workspace — antes esta colección no tenía
 * ninguna página en `/workspace`, solo era accesible desde `/admin`.
 */
export async function createMembershipAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para gestionar membresías')

  const clientId = requiredNumericId(formData, 'client')
  const clientCheck = await context.payload.find({
    collection: 'clients',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: clientId } }, { tenant: { equals: context.tenantId } }] },
  })
  if (clientCheck.docs.length === 0) throw new Error('Cliente no encontrado en el tenant activo')

  // Montos enteros (sin centavos) — ver src/lib/money.ts
  const monthlyPrice = wholeUsd(formData.get('monthlyPrice'))
  if (monthlyPrice === null || monthlyPrice <= 0) throw new Error('El precio mensual debe ser un número entero mayor a 0')

  const startDateRaw = requiredText(formData, 'startDate', 20)
  const renewalDateRaw = requiredText(formData, 'renewalDate', 20)

  await context.payload.create({
    collection: 'memberships',
    overrideAccess: false,
    user: context.user,
    data: {
      client: clientId,
      plan: requiredText(formData, 'plan', 160),
      monthlyPrice,
      status: 'activa',
      startDate: new Date(startDateRaw).toISOString(),
      renewalDate: new Date(renewalDateRaw).toISOString(),
    },
  })

  revalidatePath('/workspace/memberships')
  revalidatePath('/workspace')
}

/** Cambia el estado de una membresía (activa/pausada/vencida/cancelada) desde la lista. */
export async function changeMembershipStatusAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para gestionar membresías')

  const id = requiredNumericId(formData, 'id')
  const status = requiredText(formData, 'status', 20)
  if (!['activa', 'pausada', 'vencida', 'cancelada'].includes(status)) {
    throw new Error('Estado de membresía inválido')
  }

  const check = await context.payload.find({
    collection: 'memberships',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  if (check.docs.length === 0) throw new Error('Membresía no encontrada en el tenant activo')

  await context.payload.update({
    collection: 'memberships',
    id,
    overrideAccess: false,
    user: context.user,
    data: { status: status as 'activa' | 'pausada' | 'vencida' | 'cancelada' },
  })

  revalidatePath('/workspace/memberships')
}
