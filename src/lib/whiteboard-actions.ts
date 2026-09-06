'use server'

import { revalidatePath } from 'next/cache'

import { MAX_BOARDS_PER_TENANT, MAX_SCENE_BYTES, MAX_THUMBNAIL_BYTES, MAX_TITLE } from '@/collections/Whiteboards'
import { getWorkspaceContext } from '@/lib/workspace-context'

type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; conflict?: boolean; serverUpdatedAt?: string }

/**
 * Token de revisión: usamos updatedAt del servidor normalizado a ms. El
 * cliente lo lleva de la carga al guardado y el server rechaza writes
 * basados en una revisión que ya no es la vigente (concurrency control
 * optimista sin campo nuevo ni migración).
 */
function toRevision(value: unknown): number | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const ms = new Date(value as string).getTime()
  return Number.isFinite(ms) ? ms : null
}

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

/** Límite de elementos por escena (generoso: pizarras de texto son cientos). */
export const MAX_ELEMENTS = 20_000

/** appState que persistimos: solo viewport y fondo — nada de estado efímero del editor. */
const ALLOWED_APPSTATE_KEYS = new Set(['viewBackgroundColor', 'gridSize', 'scrollX', 'scrollY', 'zoom'])
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Copia el objeto plano descartando claves peligrosas (prototype pollution). */
function sanitizeObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`Escena inválida: ${label}`)
  const clean: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!UNSAFE_KEYS.has(key)) clean[key] = v
  }
  return clean
}

/**
 * Valida y sanea una escena antes de persistirla. La escena la pasa después
 * el editor de CUALQUIER agente del tenant, así que no se acepta estructura
 * arbitraria: elementos con id/type, archivos como objetos con dataURL
 * string, y appState podado a claves inofensivas. Las propiedades internas
 * de cada elemento no se validan campo a campo (Excalidraw las re-sanea en
 * restore), pero se descartan claves de prototype pollution.
 */
function validateScene(scene: WhiteboardScene): WhiteboardScene {
  if (!isPlainObject(scene)) throw new Error('Escena inválida')
  if (!Array.isArray(scene.elements)) throw new Error('Escena inválida: falta elements')
  if (scene.elements.length > MAX_ELEMENTS) {
    throw new Error(`La pizarra supera el límite de ${MAX_ELEMENTS} elementos`)
  }

  const elements = scene.elements.map((element) => {
    const clean = sanitizeObject(element, 'elemento sin forma de elemento')
    if (typeof clean.id !== 'string' || typeof clean.type !== 'string') {
      throw new Error('Escena inválida: elementos sin id/type')
    }
    return clean
  })

  const files: Record<string, unknown> = {}
  if (scene.files != null) {
    if (!isPlainObject(scene.files)) throw new Error('Escena inválida: files')
    for (const [key, file] of Object.entries(scene.files)) {
      if (UNSAFE_KEYS.has(key)) continue
      const cleanFile = sanitizeObject(file, 'archivo embebido sin forma de archivo')
      if (typeof cleanFile.id !== 'string') throw new Error('Escena inválida: archivos sin id')
      if (cleanFile.dataURL !== undefined && typeof cleanFile.dataURL !== 'string') {
        throw new Error('Escena inválida: dataURL de archivo no es texto')
      }
      files[key] = cleanFile
    }
  }

  const appState: Record<string, unknown> = {}
  if (scene.appState != null) {
    if (!isPlainObject(scene.appState)) throw new Error('Escena inválida: appState')
    for (const key of ALLOWED_APPSTATE_KEYS) {
      if (key in scene.appState) appState[key] = scene.appState[key]
    }
  }

  const sanitized: WhiteboardScene = { elements, files, appState }
  const serialized = JSON.stringify(sanitized)
  if (serialized.length > MAX_SCENE_BYTES) {
    throw new Error(
      `La pizarra supera el límite de ${Math.round(MAX_SCENE_BYTES / (1024 * 1024))} MB por escena — divide el contenido o quita imágenes`,
    )
  }
  return sanitized
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
export async function createWhiteboardAction(
  title: string,
): Promise<ActionResult<{ id: number; title: string; updatedAt: string | null }>> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const clean = normalizeTitle(title)

  const count = await context.payload.count({
    collection: 'whiteboards',
    where: { tenant: { equals: context.tenantId } },
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
  return { ok: true, id: board.id, title: board.title, updatedAt: board.updatedAt ?? null }
}

/**
 * Autosave del canvas (debounce en el cliente). El appState se recorta al
 * viewport para no persistir estado efímero del editor.
 */
export async function saveWhiteboardAction(
  id: number,
  scene: WhiteboardScene,
  thumbnail?: string | null,
  baseUpdatedAt?: string | null,
): Promise<ActionResult<{ updatedAt: string | null }>> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const safe = validateScene(scene)
  const doc = await scopedWhiteboard(context, id)

  // Concurrency control optimista: si la revisión vigente no es la que el
  // cliente cargó, otro agente guardó mientras tanto — rechazamos en vez de
  // pisar su trabajo. baseUpdatedAt null = sin expectativa (compat).
  if (baseUpdatedAt && toRevision(doc.updatedAt) !== toRevision(baseUpdatedAt)) {
    return {
      ok: false,
      conflict: true,
      error: 'Otro agente guardó cambios en esta pizarra mientras editabas',
      serverUpdatedAt: doc.updatedAt ?? undefined,
    }
  }

  const updated = await context.payload.update({
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
  return { ok: true, updatedAt: (updated as { updatedAt?: string }).updatedAt ?? null }
}

/** Carga la escena de una pizarra on demand (la lista nunca arrastra escenas completas). */
export async function loadWhiteboardSceneAction(
  id: number,
): Promise<ActionResult<{ scene: WhiteboardScene; updatedAt: string | null }>> {
  const context = await getWorkspaceContext()
  const doc = await scopedWhiteboard(context, id)
  const scene = doc.scene as unknown as WhiteboardScene
  return {
    ok: true,
    updatedAt: doc.updatedAt ?? null,
    scene: { elements: scene?.elements ?? [], files: scene?.files ?? {}, appState: scene?.appState ?? {} },
  }
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
): Promise<ActionResult<{ id: number; title: string; updatedAt: string | null }>> {
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
    where: { tenant: { equals: context.tenantId } },
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
  return { ok: true, id: board.id, title: board.title, updatedAt: board.updatedAt ?? null }
}
