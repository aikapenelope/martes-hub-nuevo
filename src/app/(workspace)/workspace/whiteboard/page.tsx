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
    // Margenes negativos solo donde hay padding que compensar: base -mx-4
    // (px-4 de <main>), sm/xl horizontales, y el vertical es py-5 en todos
    // los breakpoints. h-[calc(100vh-3.5rem)] coincide con el topbar.
    <div className="-mx-4 -my-5 sm:-mx-6 xl:-mx-8 h-[calc(100vh-3.5rem)]">
      <WhiteboardCanvas tenantId={tenantId} tenantName={context.tenant.name} />
    </div>
  )
}
