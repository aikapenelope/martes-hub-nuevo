'use server'

import { revalidatePath } from 'next/cache'
import type { Payload, Where } from 'payload'
import type { User } from '@/payload-types'

import { getWorkspaceContext } from '@/lib/workspace-context'

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Errores de dominio: su mensaje SÍ llega al usuario. Cualquier otro error se registra y se enmascara. */
class DomainError extends Error {}

function assertEditor(canEdit: boolean): void {
  if (!canEdit) throw new DomainError('No tienes permiso para crear o modificar notas')
}

/** Convierte una excepción en respuesta segura: dominio → mensaje; resto → log + genérico. */
function toUserError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof DomainError) return { ok: false, error: err.message }
  console.error('[notes]', err)
  return { ok: false, error: fallback }
}

/**
 * Valida que el cliente/lead vinculado exista DENTRO del tenant activo —
 * sin esto un editor podría vincular registros de otro tenant y filtrar sus
 * datos poblados a través de la nota (revisión Devin PR #75).
 */
async function assertRelatedInTenant(
  payload: Payload,
  user: User,
  tenantId: number,
  collection: 'clients' | 'leads',
  id: number,
): Promise<void> {
  const doc = await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: false,
    user,
  })
  const docTenant = typeof doc?.tenant === 'object' && doc.tenant ? doc.tenant.id : doc?.tenant
  if (!doc || docTenant !== tenantId) {
    throw new DomainError(`El ${collection === 'clients' ? 'cliente' : 'lead'} indicado no pertenece a este workspace`)
  }
}

/**
 * Convierte texto plano (del quick-add del workspace) al JSON de Lexical:
 * un párrafo por línea, sin formato. Las notas se enriquecen después con
 * el editor completo (botón "Editar" → /admin o edición in-place futura).
 */
/**
 * Búsqueda acotada al tenant activo para el picker del quick-create: evita el
 * límite de "primeros 200" al asociar clientes/leads (revisión Devin PR #75).
 */
export async function searchNoteRelatedAction(params: {
  q: string
  type: 'client' | 'lead'
}): Promise<{ ok: true; results: Array<{ id: number; label: string }> } | { ok: false; error: string }> {
  try {
    const context = await getWorkspaceContext()
    const q = params.q.trim()
    const collection = params.type === 'lead' ? 'leads' : 'clients'
    const conditions: Where[] = [{ tenant: { equals: context.tenantId } }]
    if (q) {
      conditions.push(collection === 'clients' ? { name: { like: q } } : { fullName: { like: q } })
    }
    const res = await context.payload.find({
      collection,
      where: { and: conditions },
      depth: 0,
      limit: 8,
      sort: 'createdAt',
      overrideAccess: false,
      user: context.user,
    })
    const results = res.docs.map((d) => {
      const doc = d as unknown as { id: number; name?: string; fullName?: string; phone?: string }
      const label = doc.name ?? doc.fullName ?? '#' + doc.id
      return { id: doc.id, label: doc.phone ? `${label} (${doc.phone})` : label }
    })
    return { ok: true, results }
  } catch (err) {
    return toUserError(err, 'Error al buscar')
  }
}

export async function buildLexicalFromPlainText(text: string): Promise<unknown> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  const children = (paragraphs.length > 0 ? paragraphs : ['']).map((block) => ({
    type: 'paragraph' as const,
    format: '',
    indent: 0,
    version: 1,
    children: block.split('\n').map((line, i, arr) => ({
      type: 'text' as const,
      detail: 0,
      format: 0,
      mode: 'normal' as const,
      style: '',
      text: i < arr.length - 1 ? `${line} ` : line,
      version: 1,
    })),
  }))

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children,
    },
  }
}

export async function createNoteAction(params: {
  title: string
  bodyText: string
  category?: string
  pinned?: boolean
  clientId?: number | null
  leadId?: number | null
}): Promise<ActionResult<{ noteId: number }>> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const title = params.title?.trim()
    const bodyText = params.bodyText?.trim()
    if (!title || !bodyText) {
      return { ok: false, error: 'El título y el contenido son obligatorios' }
    }

    if (params.clientId) {
      await assertRelatedInTenant(context.payload, context.user, context.tenantId, 'clients', params.clientId)
    }
    if (params.leadId) {
      await assertRelatedInTenant(context.payload, context.user, context.tenantId, 'leads', params.leadId)
    }

    const note = await context.payload.create({
      collection: 'notes',
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: {
        tenant: context.tenantId,
        title: title.slice(0, 120),
        body: (await buildLexicalFromPlainText(bodyText)) as never,
        category: params.category ?? 'general',
        pinned: params.pinned ?? false,
        ...(params.clientId ? { client: params.clientId } : {}),
        ...(params.leadId ? { lead: params.leadId } : {}),
      } as never,
    })

    revalidatePath('/workspace/notes')
    if (params.clientId) revalidatePath(`/workspace/crm/clients/${params.clientId}`)
    if (params.leadId) revalidatePath(`/workspace/crm/leads/${params.leadId}`)
    return { ok: true, noteId: note.id }
  } catch (err) {
    return toUserError(err, 'Error al crear la nota')
  }
}

export async function toggleNotePinAction(params: {
  noteId: number
}): Promise<ActionResult<{ pinned: boolean }>> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const note = await context.payload.findByID({
      collection: 'notes',
      id: params.noteId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    const updated = await context.payload.update({
      collection: 'notes',
      id: params.noteId,
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: { pinned: !note.pinned },
    })

    revalidatePath('/workspace/notes')
    return { ok: true, pinned: Boolean(updated.pinned) }
  } catch (err) {
    return toUserError(err, 'Error al fijar la nota')
  }
}

export async function deleteNoteAction(params: {
  noteId: number
}): Promise<ActionResult> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) throw new DomainError('No tienes permiso para eliminar notas')
    if (!context.isAdmin) throw new DomainError('Solo un administrador puede eliminar notas')

    await context.payload.delete({
      collection: 'notes',
      id: params.noteId,
      overrideAccess: false,
      user: context.user,
    })

    revalidatePath('/workspace/notes')
    return { ok: true }
  } catch (err) {
    return toUserError(err, 'Error al eliminar la nota')
  }
}

/** Helper para contar notas por cliente (usable desde el drawer del lead). */
export async function countNotesFor(payload: Payload, tenantId: number, clientId: number): Promise<number> {
  const res = await payload.find({
    collection: 'notes',
    where: { and: [{ tenant: { equals: tenantId } }, { client: { equals: clientId } }] },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return res.totalDocs
}
