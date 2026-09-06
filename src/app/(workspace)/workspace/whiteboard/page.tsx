import 'server-only'
import type { Metadata } from 'next'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Whiteboard } from '@/payload-types'
import { WhiteboardWorkspace } from '@/components/workspace/whiteboard/WhiteboardWorkspace'
import type { WhiteboardSummary } from '@/lib/whiteboard-actions'

export const metadata: Metadata = {
  title: 'Whiteboard — Martes Hub',
}

export default async function WhiteboardPage() {
  const context = await getWorkspaceContext()

  // Solo resúmenes: las escenas se cargan on demand al abrir cada pizarra.
  const boardsRes = await context.payload.find({
    collection: 'whiteboards',
    select: { title: true, thumbnail: true, source: true, updatedAt: true },
    limit: 200,
    sort: '-updatedAt',
    depth: 0,
    overrideAccess: false,
    user: context.user,
  })
  const initialBoards: WhiteboardSummary[] = (boardsRes.docs as Whiteboard[]).map((board) => ({
    id: board.id,
    title: board.title,
    thumbnail: board.thumbnail ?? null,
    source: board.source ?? null,
    updatedAt: board.updatedAt ?? null,
  }))

  return (
    // Margenes negativos solo donde hay padding que compensar: base -mx-4
    // (px-4 de <main>), sm/xl horizontales, y el vertical es py-5 en todos
    // los breakpoints. h-[calc(100vh-3.5rem)] coincide con el topbar.
    <div className="-mx-4 -my-5 sm:-mx-6 xl:-mx-8 h-[calc(100vh-3.5rem)]">
      <WhiteboardWorkspace
        tenantId={String(context.tenantId)}
        tenantName={context.tenant.name}
        isAdmin={context.isAdmin}
        canEdit={context.canEdit}
        initialBoards={initialBoards}
      />
    </div>
  )
}
