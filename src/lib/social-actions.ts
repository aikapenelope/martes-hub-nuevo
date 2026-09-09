'use server'

import { revalidatePath } from 'next/cache'

import { executeTool, getComposioForTenant } from '@/integrations/composio/client'
import { extractCreationId, extractIgUserId, parseToolData } from '@/lib/social-publish'
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
        data: { alt: caption.slice(0, 200) },
      })
      mediaId = media.id
    }

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
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al crear la publicación' }
  }
}

/**
 * Publica un post (borrador/programado) en Instagram vía Composio:
 * reclamo condicional por estado (un doble clic nunca publica dos veces) →
 * contenedor (`INSTAGRAM_POST_IG_USER_MEDIA`) → publish (auto-espera el
 * procesamiento) → `publicado` con `platformPostId`/permalink. Cualquier
 * error de Composio sube crudo al post (`fallido` + `lastError`) — sin fallback.
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
      depth: 1,
      overrideAccess: false,
      user: context.user,
    })
    if (!post) return { ok: false, error: 'Publicación no encontrada' }
    const postTenantId = typeof post.tenant === 'object' ? post.tenant?.id : post.tenant
    if (postTenantId !== context.tenantId) return { ok: false, error: 'La publicación no pertenece al tenant activo' }

    // Reclamo atómico por estado (patrón convertQuoteToInvoiceAction).
    const claim = await context.payload.update({
      collection: 'social-posts',
      where: {
        and: [
          { id: { equals: postId } },
          { tenant: { equals: context.tenantId } },
          { status: { in: ['borrador', 'programado'] } },
        ],
      },
      data: { status: 'publicando' as 'borrador' },
      overrideAccess: false,
      user: context.user,
    })
    if (!claim.docs || claim.docs.length === 0) {
      return { ok: false, error: 'La publicación ya no está disponible para publicar' }
    }

    try {
      const account = typeof post.account === 'object' ? post.account : null
      const composioAccountId = account?.composioConnectedAccountId ?? null
      if (!account || account.platform !== 'instagram' || !composioAccountId) {
        throw new Error('La cuenta del post no es Instagram conectado vía Composio')
      }

      const session = await getComposioForTenant(context.payload, context.tenantId)
      if (!session) throw new Error('Este tenant no tiene API key de Composio asignada')

      // La imagen del post: primera media vinculada con URL pública (S3/R2).
      const mediaIds = Array.isArray(post.media) ? post.media : []
      const mediaRef = mediaIds[0]
      const mediaId = typeof mediaRef === 'object' ? (mediaRef?.id ?? null) : (mediaRef ?? null)
      let imageUrl: string | null = null
      if (mediaId) {
        const mediaDoc = await context.payload.findByID({
          collection: 'media',
          id: mediaId,
          depth: 0,
          overrideAccess: true,
        })
        imageUrl = (mediaDoc as { url?: string | null }).url ?? null
      }
      if (!imageUrl) throw new Error('El post no tiene imagen con URL pública para publicar')

      // IG user id: el guardado al conectar o, si falta, el que devuelve la API.
      let igUserId = account.externalUserId ?? null
      if (!igUserId) {
        const info = await executeTool(session.composio, {
          toolkit: 'instagram',
          slug: 'INSTAGRAM_GET_USER_INFO',
          userId: session.userId,
          args: {},
        })
        igUserId = extractIgUserId(info)
      }
      if (!igUserId) throw new Error('No se pudo resolver el IG user id de la cuenta conectada')

      const container = await executeTool(session.composio, {
        toolkit: 'instagram',
        slug: 'INSTAGRAM_POST_IG_USER_MEDIA',
        userId: session.userId,
        args: { ig_user_id: igUserId, image_url: imageUrl, caption: post.caption },
      })
      const creationId = extractCreationId(container)
      if (!creationId) throw new Error(`Contenedor no creado: ${JSON.stringify(container).slice(0, 300)}`)

      const published = await executeTool(session.composio, {
        toolkit: 'instagram',
        slug: 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
        userId: session.userId,
        args: { ig_user_id: igUserId, creation_id: creationId, max_wait_seconds: 120 },
      })
      const publishedParsed = parseToolData(published)
      const platformPostId =
        typeof publishedParsed.id === 'string' || typeof publishedParsed.id === 'number'
          ? String(publishedParsed.id)
          : creationId

      await context.payload.update({
        collection: 'social-posts',
        id: postId,
        data: {
          status: 'publicado',
          platformPostId,
          permalink: typeof publishedParsed.permalink === 'string' ? publishedParsed.permalink : undefined,
          publishedAt: new Date().toISOString(),
          lastError: null,
        },
        overrideAccess: false,
        user: context.user,
      })

      revalidatePath('/workspace/social')
      return { ok: true, status: 'publicado', platformPostId }
    } catch (publishError) {
      const message = publishError instanceof Error ? publishError.message : 'Error desconocido de Composio'
      await context.payload.update({
        collection: 'social-posts',
        id: postId,
        data: { status: 'fallido', lastError: message },
        overrideAccess: false,
        user: context.user,
      })
      return { ok: false, error: message }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al publicar' }
  }
}
