'use server'

/**
 * Server Actions para notificaciones del workspace.
 *
 * markAllReadAction: bulk update de todas las notificaciones no leídas del
 * tenant activo → read: true. Sigue el patrón de crm/actions.ts y tasks/actions.ts:
 * overrideAccess: false + user (QUERIES.md > Access Control in Local API).
 */

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

export async function markAllReadAction(): Promise<void> {
  const context = await getWorkspaceContext()

  // payload.update con where = bulk update sobre todos los docs que cumplan
  await context.payload.update({
    collection: 'notifications',
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        { read: { equals: false } },
      ],
    },
    data: { read: true },
    overrideAccess: false,
    user: context.user,
  })

  // Revalida el layout completo para que el count del bell vuelva a cero
  revalidatePath('/', 'layout')
}
