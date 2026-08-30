import type { PayloadRequest } from 'payload'
import type { Client, Lead, Task, User } from '@/payload-types'

function firstTenantId(user: User): number | null {
  const membership = user.tenants?.[0]?.tenant
  if (!membership) return null
  return typeof membership === 'object' ? membership.id : membership
}

interface SearchResult {
  type: 'lead' | 'client' | 'task'
  id: number
  label: string
  sublabel: string
  href: string
}

/**
 * Búsqueda global del workspace — un solo cuadro que busca en leads,
 * clientes y tareas a la vez, para el command palette (Cmd/Ctrl+K).
 * Tenant-scoped igual que cualquier otra query del workspace.
 */
export async function workspaceSearchHandler(req: PayloadRequest): Promise<Response> {
  const user = req.user as User | null
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const tenantId = firstTenantId(user)
  if (!tenantId) return Response.json({ results: [] })

  const url = new URL(req.url ?? 'http://local.payload/workspace-search')
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (q.length < 2) return Response.json({ results: [] })

  const [leadsRes, clientsRes, tasksRes] = await Promise.all([
    req.payload.find({
      collection: 'leads',
      limit: 5,
      depth: 0,
      overrideAccess: false,
      user,
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { or: [{ fullName: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
        ],
      },
    }),
    req.payload.find({
      collection: 'clients',
      limit: 5,
      depth: 0,
      overrideAccess: false,
      user,
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { or: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
        ],
      },
    }),
    req.payload.find({
      collection: 'tasks',
      limit: 5,
      depth: 0,
      overrideAccess: false,
      user,
      where: { and: [{ tenant: { equals: tenantId } }, { title: { contains: q } }] },
    }),
  ])

  const results: SearchResult[] = [
    ...(leadsRes.docs as Lead[]).map((l) => ({
      type: 'lead' as const,
      id: l.id,
      label: l.fullName,
      sublabel: l.email || l.phone || 'Lead',
      href: `/workspace/crm/leads/${l.id}`,
    })),
    ...(clientsRes.docs as Client[]).map((c) => ({
      type: 'client' as const,
      id: c.id,
      label: c.name,
      sublabel: c.email || c.phone || 'Cliente',
      href: `/workspace/crm/clientes/${c.id}`,
    })),
    ...(tasksRes.docs as Task[]).map((t) => ({
      type: 'task' as const,
      id: t.id,
      label: t.title,
      sublabel: `Tarea · ${t.status}`,
      href: `/workspace/tasks/${t.id}`,
    })),
  ]

  return Response.json({ results })
}
