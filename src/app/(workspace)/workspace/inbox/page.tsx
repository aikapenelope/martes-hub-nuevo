import { getWorkspaceContext } from '@/lib/workspace-context'
import { InboxWorkspace } from '@/components/workspace/InboxWorkspace'

/**
 * InboxPage — `/workspace/inbox`. Conversaciones estilo Chatwoot:
 * lista con estados/asignación/prioridad, hilo de mensajes y panel de
 * contexto con notas internas privadas, plantillas y acciones del agente.
 * La interacción y el polling ocurren en el client component vía REST API
 * de Payload (mismo patrón que el inbox original).
 */
export default async function InboxPage() {
  const { canEdit, tenantId } = await getWorkspaceContext()

  return <InboxWorkspace canEdit={canEdit} tenantId={tenantId} />
}
