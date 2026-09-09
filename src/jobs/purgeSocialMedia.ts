import type { TaskConfig } from 'payload'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * TTL de la media temporal de publicaciones sociales (doc 01 v3): el objeto
 * ORIGINAL se borra a las 48h — Instagram ya copió la imagen a su CDN al
 * publicar, así que el post no cambia. La miniatura (`sizes.thumbnail`,
 * objeto aparte) sobrevive como historial. Cinturón y tirantes: regla de
 * ciclo de vida del bucket para el mismo fin.
 *
 * Seguridad (review Devin): SOLO purga assets marcados `socialTemp` por el
 * composer — la media general del workspace jamás se toca. Paginado completo
 * (findAllPages): cada corrida avanza sobre TODOS los candidatos, no se
 * estanca en la primera página. Idempotente: `purgedAt` (borrado lógico — el
 * doc no se elimina para no romper referencias).
 */
export const purgeExpiredSocialMediaTask: TaskConfig = {
  slug: 'purge-expired-social-media',
  label: 'Purga de media temporal social (48h)',
  schedule: [{ cron: '0 4 * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'purged', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!process.env.S3_BUCKET) {
      return {
        output: {
          purged: 0,
          summary: 'S3 no configurado — sin purga de media temporal (dev/local con storage local)',
        },
      }
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // Paginado completo de posts publicados fuera de la ventana TTL (patrón
    // findAllPages): la corrida avanza sobre todos los candidatos y no se
    // estanca en la primera página con posts ya procesados.
    const candidates: { id: number; media: unknown }[] = []
    let page = 1
    let hasMore = true
    while (hasMore) {
      const res = await req.payload.find({
        collection: 'social-posts',
        where: {
          and: [{ status: { equals: 'publicado' } }, { publishedAt: { less_than_equal: cutoff } }],
        },
        limit: 100,
        page,
        depth: 1,
        sort: 'id',
        overrideAccess: true,
      })
      for (const post of res.docs) {
        if (Array.isArray(post.media)) candidates.push({ id: post.id, media: post.media })
      }
      hasMore = Boolean(res.hasNextPage)
      page += 1
    }

    // Media temporal marcada, aún no purgada, sin duplicar por doc.
    const mediaById = new Map<number, { id: number; filename: string | null }>()
    for (const post of candidates) {
      for (const media of post.media as unknown[]) {
        if (!media || typeof media !== 'object') continue
        const doc = media as { id: number; filename?: string | null; purgedAt?: string | null; socialTemp?: boolean | null }
        if (!doc.id || !doc.filename || doc.purgedAt || doc.socialTemp !== true) continue
        mediaById.set(doc.id, { id: doc.id, filename: doc.filename })
      }
    }

    const s3 = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
    })

    let purged = 0
    let failed = 0
    for (const media of mediaById.values()) {
      try {
        await s3.send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: media.filename as string }),
        )
        await req.payload.update({
          collection: 'media',
          id: media.id,
          data: { purgedAt: new Date().toISOString() },
          overrideAccess: true,
        })
        purged += 1
      } catch (err) {
        failed += 1
        req.payload.logger.error({ msg: 'purge-expired-social-media: error al purgar', id: media.id, err })
      }
    }

    const summary = `Originales purgados: ${purged} (${failed} fallidos) de ${mediaById.size} candidatos en ${candidates.length} posts`
    req.payload.logger.info({ msg: 'purge-expired-social-media completado', summary })
    return { output: { purged, summary } }
  },
}
