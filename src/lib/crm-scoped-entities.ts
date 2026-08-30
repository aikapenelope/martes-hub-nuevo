import 'server-only'

import type { Client, Lead } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'

export interface ScopedEntityResult<T> {
  entity: T
  context: Awaited<ReturnType<typeof getWorkspaceContext>>
}

/**
 * Recupera un Lead verificado dentro del tenant activo y con el contexto de permisos del usuario.
 */
export async function getScopedLead(id: number): Promise<{ lead: Lead; context: Awaited<ReturnType<typeof getWorkspaceContext>> }> {
  const context = await getWorkspaceContext()
  const result = await context.payload.find({
    collection: 'leads',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const lead = result.docs[0] as Lead | undefined
  if (!lead) throw new Error('Lead no encontrado en el tenant activo')
  return { lead, context }
}

/**
 * Recupera un Client verificado dentro del tenant activo y con el contexto de permisos del usuario.
 */
export async function getScopedClient(id: number): Promise<{ client: Client; context: Awaited<ReturnType<typeof getWorkspaceContext>> }> {
  const context = await getWorkspaceContext()
  const result = await context.payload.find({
    collection: 'clients',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const client = result.docs[0] as Client | undefined
  if (!client) throw new Error('Cliente no encontrado en el tenant activo')
  return { client, context }
}
