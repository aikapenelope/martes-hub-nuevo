'use server'

import { revalidatePath } from 'next/cache'

import { MAX_BOARDS_PER_TENANT, MAX_SCENE_BYTES, MAX_THUMBNAIL_BYTES, MAX_TITLE } from '@/collections/Whiteboards'
import { getWorkspaceContext } from '@/lib/workspace-context'

type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Contrato de escena Excalidraw que persistimos (appState solo viewport). */
// type (no interface) para tener firma de índice implícita y ser asignable
// al tipo del campo json de Payload.
export type WhiteboardScene = {
  elements: unknown[]
  files?: Record<string, unknown>
  appState?: Record<string, unknown>
}

export interface WhiteboardSummary {
  id: number
  title: string
  thumbnail: string | null
  source: 'local' | 'import' | null
  updatedAt: string | null
}

function assertEditor(canEdit: boolean): void {
  if (!canEdit) throw new Error('No tienes permiso para editar whiteboards')
}

function normalizeTitle(title: string): string {
  const clean = String(title ?? '').trim().slice(0, MAX_TITLE)
  if (!clean) throw new Error('El título de la pizarra no puede estar vacío')
  return clean
}

/** Valida y acota una escena cruda del cliente antes de persistirla. */
function validateScene(scene: WhiteboardScene): WhiteboardScene {
  if (!scene || !Array.isArray(scene.elements)) {
    throw new Error('Escena inválida: falta elements')
  }
  const serialized = JSON.stringify(scene)
  if (serialized.length > MAX_SCENE_BYTES) {
    throw new Error(
      `La pizarra supera el límite de ${Math.round(MAX_SCENE_BYTES / (1024 * 1024))} MB por escena — divide el contenido o quita imágenes`,
    )
  }
  return scene
}

function validateThumbnail(thumbnail: string | null | undefined): string | null {
  if (!thumbnail) return null
  if (thumbnail.length > MAX_THUMBNAIL_BYTES) return null // miniatura demediada: se descarta, nunca bloquea el guardado
  return thumbnail
}

/** Busca la pizarra scoped al tenant activo; lanza si no existe o es de otro tenant. */
async function scopedWhiteboard(
  context: Awaited<ReturnType<typeof getWorkspaceContext>>,
  id: number,
) {
  const result = await context.payload.find({
    collection: 'whiteboards',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: context.tenantId } }] },
  })
  const doc = result.docs[0]
  if (!doc) throw new Error('Pizarra no encontrada en el tenant activo')
  return doc
}

function revalidateWhiteboard(): void {
  revalidatePath('/workspace/whiteboard')
}

/**
 * Crea una pizarra vacía en el tenant activo. Compartida: todos los agentes
 * del tenant la ven y pueden editarla (decisión de producto Fase 2).
 */
export async function createWhiteboardAction(title: string): Promise<ActionResult<{ id: number; title: string }>> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const clean = normalizeTitle(title)

  const count = await context.payload.count({
    collection: 'whiteboards',
    overrideAccess: false,
    user: context.user,
  })
  if (count.totalDocs >= MAX_BOARDS_PER_TENANT) {
    return { ok: false, error: `Límite de ${MAX_BOARDS_PER_TENANT} pizarras por workspace alcanzado` }
  }

  const board = await context.payload.create({
    collection: 'whiteboards',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      title: clean,
      scene: { elements: [], files: {} },
      source: 'local',
    },
  })

  revalidateWhiteboard()
  return { ok: true, id: board.id, title: board.title }
}

/**
 * Autosave del canvas (debounce en el cliente). El appState se recorta al
 * viewport para no persistir estado efímero del editor.
 */
export async function saveWhiteboardAction(
  id: number,
  scene: WhiteboardScene,
  thumbnail?: string | null,
): Promise<ActionResult> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const safe = validateScene(scene)
  await scopedWhiteboard(context, id)

  await context.payload.update({
    collection: 'whiteboards',
    id,
    overrideAccess: false,
    user: context.user,
    data: {
      scene: { elements: safe.elements, files: safe.files ?? {}, appState: safe.appState ?? {} },
      ...(thumbnail !== undefined ? { thumbnail: validateThumbnail(thumbnail) } : {}),
    },
  })

  revalidateWhiteboard()
  return { ok: true }
}

/** Carga la escena de una pizarra on demand (la lista nunca arrastra escenas completas). */
export async function loadWhiteboardSceneAction(id: number): Promise<ActionResult<{ scene: WhiteboardScene }>> {
  const context = await getWorkspaceContext()
  const doc = await scopedWhiteboard(context, id)
  const scene = doc.scene as unknown as WhiteboardScene
  return { ok: true, scene: { elements: scene?.elements ?? [], files: scene?.files ?? {}, appState: scene?.appState ?? {} } }
}

/** Elimina una pizarra. Solo admin, igual que el resto de colecciones del workspace. */
export async function deleteWhiteboardAction(id: number): Promise<ActionResult> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) return { ok: false, error: 'Solo un administrador puede borrar pizarras' }
  await scopedWhiteboard(context, id)

  await context.payload.delete({
    collection: 'whiteboards',
    id,
    overrideAccess: false,
    user: context.user,
  })

  revalidateWhiteboard()
  return { ok: true }
}

/** Renombra una pizarra. */
export async function renameWhiteboardAction(id: number, title: string): Promise<ActionResult> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)
  const clean = normalizeTitle(title)
  await scopedWhiteboard(context, id)

  await context.payload.update({
    collection: 'whiteboards',
    id,
    overrideAccess: false,
    user: context.user,
    data: { title: clean },
  })

  revalidateWhiteboard()
  return { ok: true }
}

/**
 * Importa un archivo de whiteboard (`.excalidraw` / `.json` exportado desde
 * Excalidraw) o una escena cruda `{ elements, files }`. El cliente lee el
 * archivo y manda el texto; aquí se valida estructura y tamaño.
 */
export async function importWhiteboardAction(
  title: string,
  rawJson: string,
): Promise<ActionResult<{ id: number; title: string }>> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  if (typeof rawJson !== 'string' || rawJson.length > MAX_SCENE_BYTES + MAX_THUMBNAIL_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de tamaño por pizarra' }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido' }
  }

  // Formatos aceptados: archivo exportado de Excalidraw ({ type: 'excalidraw', elements, files, ... })
  // y escena cruda ({ elements, files }).
  const elements = (parsed.type ? (parsed.type === 'excalidraw' ? parsed.elements : undefined) : parsed.elements) as
    | unknown[]
    | undefined
  if (!Array.isArray(elements)) {
    return { ok: false, error: 'El archivo no tiene una escena Excalidraw reconocible (falta elements)' }
  }
  const files = (parsed.files as Record<string, unknown>) ?? {}
  const appState = (parsed.appState as Record<string, unknown>) ?? {}

  let scene: WhiteboardScene
  try {
    scene = validateScene({ elements, files, appState })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Escena inválida' }
  }

  const clean = normalizeTitle(title)
  const count = await context.payload.count({
    collection: 'whiteboards',
    overrideAccess: false,
    user: context.user,
  })
  if (count.totalDocs >= MAX_BOARDS_PER_TENANT) {
    return { ok: false, error: `Límite de ${MAX_BOARDS_PER_TENANT} pizarras por workspace alcanzado` }
  }

  const board = await context.payload.create({
    collection: 'whiteboards',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      title: clean,
      scene,
      source: 'import',
    },
  })

  revalidateWhiteboard()
  return { ok: true, id: board.id, title: board.title }
}
