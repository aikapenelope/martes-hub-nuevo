import { getWorkspaceContext } from '@/lib/workspace-context'
import { InboxWorkspace } from '@/components/workspace/InboxWorkspace'
import { getAssignableUsers } from '@/lib/tasks-data'
import type { ContactItem } from '@/lib/inbox-actions'

/**
 * InboxPage — `/workspace/inbox`. Conversaciones estilo Chatwoot:
 * lista con estados/asignación/prioridad, hilo de mensajes y panel de
 * contexto con notas internas privadas, plantillas y acciones del agente.
 * La interacción y el polling ocurren en el client component vía REST API
 * de Payload (mismo patrón que el inbox original).
 *
 * Deep link: `/workspace/inbox?c=<id>` abre directamente la conversación —
 * lo usan el timeline unificado de la ficha CRM y el kanban del pipeline.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { canEdit, tenant, tenantId, payload, user } = await getWorkspaceContext()
  const { c } = await searchParams
  const conversationId = Number(c)
  const initialConversationId = Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null

  // Cargar usuarios asignables y contactos recientes del CRM en paralelo
  const [assignees, clientsRes, leadsRes] = await Promise.all([
    getAssignableUsers({
      payload,
      user,
      tenantId,
    }),
    payload.find({
      collection: 'clients',
      limit: 20,
      sort: '-createdAt',
      overrideAccess: false,
      user,
      where: { tenant: { equals: tenantId } },
      select: {
        name: true,
        companyName: true,
        phone: true,
        email: true,
      },
    }),
    payload.find({
      collection: 'leads',
      limit: 20,
      sort: '-createdAt',
      overrideAccess: false,
      user,
      where: { tenant: { equals: tenantId } },
      select: {
        fullName: true,
        companyName: true,
        phone: true,
        email: true,
      },
    }),
  ])

  const initialTeam = assignees.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    roles: u.roles,
  }))

  const initialContacts: ContactItem[] = [
    ...clientsRes.docs.map((c) => ({
      id: c.id,
      kind: 'client' as const,
      name: c.name,
      company: c.companyName ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    })),
    ...leadsRes.docs.map((l) => ({
      id: l.id,
      kind: 'lead' as const,
      name: l.fullName,
      company: l.companyName ?? null,
      phone: l.phone ?? null,
      email: l.email ?? null,
    })),
  ]

  return (
    <InboxWorkspace
      canEdit={canEdit}
      tenantId={tenantId}
      tenantName={tenant.name}
      initialConversationId={initialConversationId}
      initialTeam={initialTeam}
      initialContacts={initialContacts}
    />
  )
}
