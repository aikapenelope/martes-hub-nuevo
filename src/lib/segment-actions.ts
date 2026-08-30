'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

/** Rubros (segments) — usados como filtro/relación en CRM, offers y email-campaigns. Sin UI nativa hasta ahora. */
export async function createSegmentAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para crear rubros')

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) throw new Error('El nombre es obligatorio')

  const description = formData.get('description')

  await context.payload.create({
    collection: 'segments',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: name.trim().slice(0, 160),
      description: typeof description === 'string' && description.trim() ? description.trim().slice(0, 500) : undefined,
    },
  })

  revalidatePath('/workspace/segments')
}

export async function deleteSegmentAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) throw new Error('Solo un admin puede eliminar rubros')

  const id = Number(formData.get('id'))
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador inválido')

  await context.payload.delete({
    collection: 'segments',
    id,
    overrideAccess: false,
    user: context.user,
  })

  revalidatePath('/workspace/segments')
}
