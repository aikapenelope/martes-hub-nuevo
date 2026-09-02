'use server'

import { revalidatePath } from 'next/cache'
import { getWorkspaceContext } from '@/lib/workspace-context'

export interface UploadMediaResult {
  ok: boolean
  id?: number
  url?: string
  error?: string
}

/**
 * Sube un archivo (imagen o documento) a la colección `media` del tenant
 * activo usando la Local API de Payload.
 *
 * Si S3_BUCKET está configurado, el plugin @payloadcms/storage-s3 almacena
 * el archivo directamente en Cloudflare R2 / S3. Si no, se guarda localmente.
 * Revalida la ruta `/workspace/media` para refrescar la galería sin salir al admin.
 */
export async function uploadMediaAction(formData: FormData): Promise<UploadMediaResult> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) {
      return { ok: false, error: 'No tienes permiso para subir archivos' }
    }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Por favor selecciona un archivo válido' }
    }

    const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, error: 'El archivo supera el tamaño máximo permitido de 20 MB' }
    }

    const altRaw = formData.get('alt')
    const alt =
      typeof altRaw === 'string' && altRaw.trim()
        ? altRaw.trim().slice(0, 200)
        : file.name.replace(/\.[^/.]+$/, '')

    const buffer = Buffer.from(await file.arrayBuffer())

    const doc = await context.payload.create({
      collection: 'media',
      overrideAccess: false,
      user: context.user,
      data: {
        alt,
        tenant: context.tenantId,
      },
      file: {
        data: buffer,
        mimetype: file.type || 'application/octet-stream',
        name: file.name,
        size: file.size,
      },
    })

    revalidatePath('/workspace/media')
    return {
      ok: true,
      id: doc.id,
      url: typeof doc.url === 'string' ? doc.url : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al subir archivo'
    return { ok: false, error: message }
  }
}
