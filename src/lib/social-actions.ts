'use server'

import { revalidatePath } from 'next/cache'

import { runSocialPublish } from '@/lib/social-publish-exec'
import { sanitizeErrorForUi } from '@/lib/social-publish'
import { getWorkspaceContext } from '@/lib/workspace-context'

const MAX_NAME = 160
const MAX_CAPTION = 2200

type SocialActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalText(formData: FormData, key: string, max: number): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().slice(0, max)
}

/**
 * Conecta una cuenta social (referencia — sin credenciales, ver
 * SocialAccounts.ts) directamente desde el workspace, reemplazando el
 * link a `/admin/collections/social-accounts/create`. La colección
 * requiere rol admin para crear/editar (`access.create: adminOnly`), así
 * que esta acción exige lo mismo.
 */
export async function createSocialAccountAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) throw new Error('Conectar una cuenta social requiere rol admin')

  const platform = requiredText(formData, 'platform', 20)
  if (platform !== 'instagram' && platform !== 'facebook') throw new Error('Plataforma inválida')

  await context.payload.create({
    collection: 'social-accounts',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      accountName: requiredText(formData, 'accountName', MAX_NAME),
      platform,
      platformAccountId: requiredText(formData, 'platformAccountId', MAX_NAME),
      status: 'conectada',
      profilePictureUrl: optionalText(formData, 'profilePictureUrl', 500),
    },
  })

  revalidatePath('/workspace/social')
}

/**
 * Crea (borrador o programado) una publicación social desde el workspace.
 * Si viene una imagen (FormData `image`), se sube a `media` (S3/R2) y queda
 * vinculada al post — media temporal: el job TTL purga el original a las 48h.
 * La publicación real la hace `publishSocialPostAction`.
 */
export async function createSocialPostAction(
  formData: FormData,
): Promise<SocialActionResult<{ postId: number; status: string }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para crear publicaciones' }

    const accountId = Number(formData.get('account'))
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return { ok: false, error: 'Selecciona una cuenta de destino' }
    }

    const accountCheck = await context.payload.find({
      collection: 'social-accounts',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: { and: [{ id: { equals: accountId } }, { tenant: { equals: context.tenantId } }] },
    })
    if (accountCheck.docs.length === 0) return { ok: false, error: 'Cuenta social no encontrada en el tenant activo' }

    const caption = requiredText(formData, 'caption', MAX_CAPTION)
    const scheduledAtRaw = optionalText(formData, 'scheduledAt', 30)

    // Imagen opcional → media (los bytes van por el Local API; storage plugin → S3/R2)
    let mediaId: number | undefined
    const file = formData.get('image')
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith('image/')) return { ok: false, error: 'La imagen debe ser PNG/JPG/WebP' }
      if (file.size > 8 * 1024 * 1024) return { ok: false, error: 'La imagen no puede pesar más de 8 MB' }
      const buffer = Buffer.from(await file.arrayBuffer())
      const media = await context.payload.create({
        collection: 'media',
        overrideAccess: false,
        user: context.user,
        file: {
          data: buffer,
          mimetype: file.type,
          name: file.name || 'social.jpg',
          size: file.size,
        },
        // Marcador de media temporal social: el job TTL (48h) SOLO purga
        // originales marcados así — nunca assets generales del workspace.
        data: { alt: caption.slice(0, 200), socialTemp: true },
      })
      mediaId = media.id
    }

    try {
      const post = await context.payload.create({
        collection: 'social-posts',
        overrideAccess: false,
        user: context.user,
        data: {
          tenant: context.tenantId,
          caption,
          account: accountId,
          status: scheduledAtRaw ? 'programado' : 'borrador',
          scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : undefined,
          ...(mediaId ? { media: [mediaId] } : {}),
        },
      })

      revalidatePath('/workspace/social')
      return { ok: true, postId: post.id, status: post.status }
    } catch (postError) {
      // Falló el post tras subir la imagen: borrar el media (el storage plugin
      // elimina también el objeto S3/R2) para no dejar huérfanos.
      if (mediaId) {
        await context.payload
          .delete({ collection: 'media', id: mediaId, overrideAccess: false, user: context.user })
          .catch(() => undefined)
      }
      throw postError
    }
  } catch (error) {
    return {
      ok: false,
      error: sanitizeErrorForUi(error instanceof Error ? error.message : 'Error al crear la publicación'),
    }
  }
}

/**
 * Publica un post (borrador/programado) en Instagram vía Composio. Valida
 * permisos/tenant y delega en `runSocialPublish` (compartido con el job de
 * programados). A la UI solo llega el error sanitizado; el crudo queda en
 * `social-posts.lastError` y en los logs del servidor.
 */
export async function publishSocialPostAction(
  postId: number,
): Promise<SocialActionResult<{ status: string; platformPostId?: string }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para publicar' }

    const post = await context.payload.findByID({
      collection: 'social-posts',
      id: postId,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })
    if (!post) return { ok: false, error: 'Publicación no encontrada' }
    const postTenantId = typeof post.tenant === 'object' ? post.tenant?.id : post.tenant
    if (postTenantId !== context.tenantId) {
      return { ok: false, error: 'La publicación no pertenece al tenant activo' }
    }

    const result = await runSocialPublish(context.payload, { tenantId: context.tenantId, postId })
    if (!result.ok) return { ok: false, error: sanitizeErrorForUi(result.error) }

    revalidatePath('/workspace/social')
    return { ok: true, status: result.status, platformPostId: result.platformPostId }
  } catch (error) {
    return {
      ok: false,
      error: sanitizeErrorForUi(error instanceof Error ? error.message : 'Error al publicar'),
    }
  }
}
