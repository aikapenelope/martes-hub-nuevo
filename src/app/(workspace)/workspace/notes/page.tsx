/**
 * NotesPage — `/workspace/notes`. Espacio personal de notas, apuntes rápidos
 * y to-dos con panel lateral deslizable (Slide-over Drawer).
 */

import type { Where } from 'payload'
import type { Note } from '@/payload-types'
import { NOTE_CATEGORIES } from '@/collections/Notes'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { NotesWorkspace } from '@/components/workspace/notes/NotesWorkspace'

const PAGE_SIZE = 24

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; pin?: string; page?: string }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit, isAdmin } = context

  const q = params.q?.trim() ?? ''
  const cat = params.cat && (NOTE_CATEGORIES as readonly string[]).includes(params.cat as never) ? params.cat : ''
  const pinOnly = params.pin === '1'
  const pageNum = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const conditions: Where[] = [{ tenant: { equals: tenantId } }]
  if (q) conditions.push({ title: { like: q } })
  if (cat) conditions.push({ category: { equals: cat } })
  if (pinOnly) conditions.push({ pinned: { equals: true } })
  const where: Where = { and: conditions }

  const notesRes = await payload.find({
    collection: 'notes',
    where,
    depth: 1,
    limit: PAGE_SIZE,
    page: pageNum,
    sort: '-pinned,-createdAt',
    overrideAccess: false,
    user,
  })

  const notes = notesRes.docs as Note[]
  const total = notesRes.totalDocs
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <NotesWorkspace
      notes={notes}
      total={total}
      totalPages={totalPages}
      currentPage={pageNum}
      activeQuery={q}
      activeCategory={cat}
      pinnedOnly={pinOnly}
      canEdit={canEdit}
      isAdmin={isAdmin}
    />
  )
}
