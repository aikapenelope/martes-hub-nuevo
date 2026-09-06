'use server'

import type { Client, Lead } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Búsqueda tenant-scoped de leads y clientes para el selector de contacto
 * del ActivityDrawer global. Las opciones iniciales de la página traen solo
 * los 100 contactos más recientes; esto permite encontrar cualquiera por
 * nombre, email o teléfono sin que los contactos antiguos queden fuera del
 * picker. `createActivityAction` revalida la pertenencia al tenant al
 * guardar, así que el resultado solo acelera la selección.
 */
export async function searchActivityContactsAction(query: string): Promise<{
  leads: { id: number; label: string }[]
  clients: { id: number; label: string }[]
}> {
  const context = await getWorkspaceContext()
  const q = query.trim()
  if (q.length < 2) return { leads: [], clients: [] }

  const [leadsRes, clientsRes] = await Promise.all([
    context.payload.find({
      collection: 'leads',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { or: [{ fullName: { like: q } }, { email: { like: q } }, { phone: { like: q } }] },
        ],
      },
      limit: 20,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'clients',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { or: [{ name: { like: q } }, { email: { like: q } }, { phone: { like: q } }] },
        ],
      },
      limit: 20,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: false,
      user: context.user,
    }),
  ])

  const leadLabel = (lead: Lead) => (lead.email ? `${lead.fullName} (${lead.email})` : lead.fullName)
  const clientLabel = (client: Client) => (client.email ? `${client.name} (${client.email})` : client.name)

  return {
    leads: (leadsRes.docs as Lead[]).map((lead) => ({ id: lead.id, label: leadLabel(lead) })),
    clients: (clientsRes.docs as Client[]).map((client) => ({ id: client.id, label: clientLabel(client) })),
  }
}
