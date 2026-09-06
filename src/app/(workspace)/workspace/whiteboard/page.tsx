import 'server-only'
import type { Metadata } from 'next'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { WhiteboardCanvas } from '@/components/workspace/whiteboard/WhiteboardCanvas'

export const metadata: Metadata = {
  title: 'Whiteboard — Martes Hub',
}

export default async function WhiteboardPage() {
  const context = await getWorkspaceContext()
  const tenantId = typeof context.tenantId === 'number'
    ? String(context.tenantId)
    : context.tenantId

  return (
    // h-full para que ocupe el espacio disponible dentro del <main> que ya tiene overflow-y-auto
    <div className="-m-5 sm:-m-6 xl:-m-8 h-[calc(100vh-3.5rem)]">
      <WhiteboardCanvas tenantId={tenantId} tenantName={context.tenant.name} />
    </div>
  )
}
