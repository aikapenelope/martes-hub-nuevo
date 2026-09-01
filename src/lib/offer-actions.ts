'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalNumericId(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key)
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Selecciona un valor válido para ${key}`)
  return value
}

/**
 * Valida que el segmento pertenezca al tenant activo — un editor no
 * puede vincular el segmento de otro tenant (hallazgo de Devin Review).
 */
async function assertTenantSegment(
  context: Awaited<ReturnType<typeof getWorkspaceContext>>,
  segmentId: number | undefined,
): Promise<void> {
  if (!segmentId) return
  const check = await context.payload.find({
    collection: 'segments',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: segmentId } }, { tenant: { equals: context.tenantId } }] },
  })
  if (check.docs.length === 0) throw new Error('Segmento no encontrado en el tenant activo')
}

/** Crea una oferta del catálogo desde el workspace. */
export async function createOfferAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para gestionar ofertas')

  const price = Number(formData.get('price'))
  if (!Number.isFinite(price) || price <= 0) throw new Error('El precio debe ser mayor a 0')

  const segment = optionalNumericId(formData, 'segment')
  await assertTenantSegment(context, segment)
  const descriptionRaw = formData.get('description')

  await context.payload.create({
    collection: 'offers',
    overrideAccess: false,
    user: context.user,
    data: {
      // Tenant explícito: misma convención que createTaskAction — sin esto
      // la oferta nace sin tenant y desaparece del catálogo filtrado.
      tenant: context.tenantId,
      name: requiredText(formData, 'name', 160),
      price,
      ...(typeof descriptionRaw === 'string' && descriptionRaw.trim() ? { description: descriptionRaw.trim().slice(0, 2000) } : {}),
      ...(segment ? { segment } : {}),
      active: true,
    },
  })

  revalidatePath('/workspace/offers')
}

/** Activa/desactiva una oferta del catálogo. */
export async function toggleOfferActiveAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para gestionar ofertas')

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id) || id <= 0) throw new Error('Oferta inválida')

  const offerRes = await context.payload.find({
    collection: 'offers',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const offer = offerRes.docs[0]
  if (!offer) throw new Error('Oferta no encontrada en el tenant activo')

  await context.payload.update({
    collection: 'offers',
    id,
    overrideAccess: false,
    user: context.user,
    data: { active: !(offer.active ?? false) },
  })

  revalidatePath('/workspace/offers')
}
