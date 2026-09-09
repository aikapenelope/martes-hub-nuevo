import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Media temporal de publicaciones sociales (doc 01 v3): `media.purged_at`
 * marca el original cuya objeto S3/R2 ya purgó el job TTL (48h). La miniatura
 * (sizes.thumbnail, jsonb en el mismo doc) sobrevive como historial.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "purged_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "media" DROP COLUMN IF EXISTS "purged_at";`)
}
