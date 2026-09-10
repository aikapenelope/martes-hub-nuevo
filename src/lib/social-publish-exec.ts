import type { Payload } from 'payload'

import { executeTool, getComposioForTenant } from '@/integrations/composio/client'
import { postPhoto as tiktokPostPhoto } from '@/integrations/composio/tiktok'
import {
  assertToolSuccess,
  extractCreationId,
  extractIgUserId,
  parseToolData,
} from '@/lib/social-publish'

/**
 * Pipeline de publicación Instagram vía Composio (doc ideas-futuras/01 v3),
 * extraído para que lo usen la server action (usuario) y el job de
 * programados (sistema). El llamador es responsable de validar permisos y
 * tenant ANTES de llamar: aquí todo corre con overrideAccess y la atomicidad
 * del reclamo por estado garantiza un solo ganador.
 */

export type SocialPublishResult =
  | { ok: true; status: 'publicado'; platformPostId: string }
  | { ok: false; error: string }

/**
 * Publica un post Instagram: reclamo condicional por estado (borrador/
 * programado → publicando) → contenedor → publish (auto-espera) → publicado.
 * En error: post `fallido` + `lastError` con el error CRUDO de Composio (para
 * BD/logs — la UI debe sanitizarlo con sanitizeErrorForUi).
 */
export async function runSocialPublish(
  payload: Payload,
  options: { tenantId: number; postId: number },
): Promise<SocialPublishResult> {
  const post = await payload.findByID({
    collection: 'social-posts',
    id: options.postId,
    depth: 1,
    overrideAccess: true,
  })
  const postTenantId = typeof post.tenant === 'object' ? post.tenant?.id : post.tenant
  if (postTenantId !== options.tenantId) return { ok: false, error: 'La publicación no pertenece al tenant' }

  // Reclamo atómico por estado (patrón convertQuoteToInvoiceAction): un solo ganador.
  const claim = await payload.update({
    collection: 'social-posts',
    where: {
      and: [
        { id: { equals: options.postId } },
        { tenant: { equals: options.tenantId } },
        { status: { in: ['borrador', 'programado'] } },
      ],
    },
    data: { status: 'publicando' as 'borrador' },
    overrideAccess: true,
  })
  if (!claim.docs || claim.docs.length === 0) {
    return { ok: false, error: 'La publicación ya no está disponible para publicar' }
  }

  try {
    const account = typeof post.account === 'object' ? post.account : null
    if (!account || !account.composioConnectedAccountId) {
      throw new Error('La cuenta del post no está conectada vía Composio')
    }

    // Imagen del post: primera media vinculada con URL pública (S3/R2).
    const mediaIds = Array.isArray(post.media) ? post.media : []
    const mediaRef = mediaIds[0]
    const mediaId = typeof mediaRef === 'object' ? (mediaRef?.id ?? null) : (mediaRef ?? null)
    let imageUrl: string | null = null
    if (mediaId) {
      const mediaDoc = await payload.findByID({ collection: 'media', id: mediaId, depth: 0, overrideAccess: true })
      imageUrl = (mediaDoc as { url?: string | null }).url ?? null
    }
    if (!imageUrl) throw new Error('El post no tiene imagen con URL pública para publicar')

    // Ruta TikTok (foto v1; video llega con UPLOAD/PUBLISH en fase siguiente).
    if (account.platform === 'tiktok') {
      const session = await getComposioForTenant(payload, options.tenantId)
      if (!session) throw new Error('Este tenant no tiene API key de Composio asignada')
      const posted = await tiktokPostPhoto(session.composio, {
        userId: session.userId,
        imageUrl,
        title: post.caption.slice(0, 150),
      })
      const platformPostId = posted.postId
      if (!platformPostId) throw new Error('TikTok no devolvió post_id — revisa el schema en el spike')
      await payload.update({
        collection: 'social-posts',
        id: options.postId,
        data: {
          status: 'publicado',
          platformPostId,
          publishedAt: new Date().toISOString(),
          lastError: null,
        },
        overrideAccess: true,
      })
      return { ok: true, status: 'publicado', platformPostId }
    }

    if (account.platform !== 'instagram') {
      throw new Error(`Plataforma no soportada para publicar: ${account.platform}`)
    }

    const session = await getComposioForTenant(payload, options.tenantId)
    if (!session) throw new Error('Este tenant no tiene API key de Composio asignada')

    // IG user id: guardado al conectar o resuelto contra la API ahora.
    let igUserId = account.externalUserId ?? null
    if (!igUserId) {
      const info = await executeTool(session.composio, {
        toolkit: 'instagram',
        slug: 'INSTAGRAM_GET_USER_INFO',
        userId: session.userId,
        args: {},
      })
      assertToolSuccess(info, 'GET_USER_INFO')
      igUserId = extractIgUserId(info)
    }
    if (!igUserId) throw new Error('No se pudo resolver el IG user id de la cuenta conectada')

    const container = await executeTool(session.composio, {
      toolkit: 'instagram',
      slug: 'INSTAGRAM_POST_IG_USER_MEDIA',
      userId: session.userId,
      args: { ig_user_id: igUserId, image_url: imageUrl, caption: post.caption },
    })
    assertToolSuccess(container, 'creación del contenedor')
    const creationId = extractCreationId(container)
    if (!creationId) throw new Error(`Contenedor sin id: ${JSON.stringify(container).slice(0, 300)}`)

    const published = await executeTool(session.composio, {
      toolkit: 'instagram',
      slug: 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
      userId: session.userId,
      args: { ig_user_id: igUserId, creation_id: creationId, max_wait_seconds: 120 },
    })
    assertToolSuccess(published, 'publicación')
    const publishedParsed = parseToolData(published)
    // Un publish exitoso devuelve el id REAL del media publicado — sin id no hay éxito.
    const platformPostId =
      typeof publishedParsed.id === 'string' || typeof publishedParsed.id === 'number'
        ? String(publishedParsed.id)
        : null
    if (!platformPostId) throw new Error('Publicación sin id de media: se asume fallida')

    await payload.update({
      collection: 'social-posts',
      id: options.postId,
      data: {
        status: 'publicado',
        platformPostId,
        permalink: typeof publishedParsed.permalink === 'string' ? publishedParsed.permalink : undefined,
        publishedAt: new Date().toISOString(),
        lastError: null,
      },
      overrideAccess: true,
    })

    return { ok: true, status: 'publicado', platformPostId }
  } catch (publishError) {
    const message = publishError instanceof Error ? publishError.message : 'Error desconocido de Composio'
    await payload.update({
      collection: 'social-posts',
      id: options.postId,
      data: { status: 'fallido', lastError: message },
      overrideAccess: true,
    })
    return { ok: false, error: message }
  }
}
