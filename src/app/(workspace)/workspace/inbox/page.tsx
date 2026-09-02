import { getWorkspaceContext } from '@/lib/workspace-context'
import { InboxWorkspace } from '@/components/workspace/InboxWorkspace'

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
  const { canEdit, tenantId } = await getWorkspaceContext()
  const { c } = await searchParams
  const conversationId = Number(c)
  const initialConversationId = Number.isInteger(conversationId) && conversationId > 0 ? conversationId : null

  return <InboxWorkspace canEdit={canEdit} tenantId={tenantId} initialConversationId={initialConversationId} />
}
