import type { TaskConfig } from 'payload'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * TTL de la media temporal de publicaciones sociales (doc 01 v3): el objeto
 * ORIGINAL de una imagen publicada se borra a las 48h — Instagram ya copió la
 * imagen a su CDN al publicar, así que el post no cambia. La miniatura
 * (`sizes.thumbnail`, objeto aparte) sobrevive como historial. Cinturón y
 * tirantes: regla de ciclo de vida del bucket para el mismo fin.
 *
 * Idempotente: marca `purgedAt` en el doc (borrado lógico — el doc no se
 * elimina para no romper referencias). Sin S3 configurado, early return
 * informativo (patrón isGmailSyncConfigured).
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

    const now = Date.now()
    const cutoff = new Date(now - 48 * 60 * 60 * 1000).toISOString()

    // Posts publicados hace ≥48h con media aún no purgada.
    const posts = await req.payload.find({
      collection: 'social-posts',
      where: {
        and: [
          { status: { equals: 'publicado' } },
          { publishedAt: { less_than_equal: cutoff } },
        ],
      },
      limit: 100,
      depth: 1,
      sort: 'id',
      overrideAccess: true,
    })

    const mediaDocs = posts.docs
      .flatMap((post) => (Array.isArray(post.media) ? post.media : []))
      .filter((media): media is Exclude<typeof media, number> => typeof media === 'object' && media !== null)
      .filter((media) => !media.purgedAt && Boolean(media.filename))

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
    for (const media of mediaDocs) {
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

    const summary = `Originales purgados: ${purged} (${failed} fallidos) de ${mediaDocs.length} candidatos`
    req.payload.logger.info({ msg: 'purge-expired-social-media completado', summary })
    return { output: { purged, summary } }
  },
}
