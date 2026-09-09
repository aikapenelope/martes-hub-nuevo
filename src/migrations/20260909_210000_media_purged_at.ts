import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Media temporal de publicaciones sociales (doc 01 v3): `media.purged_at`
 * marca el original cuya objeto S3/R2 ya purgó el job TTL (48h). La miniatura
 * (sizes.thumbnail, jsonb en el mismo doc) sobrevive como historial.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "purged_at" timestamp(3) with time zone;
  -- imageSizes.thumbnail (review Devin): Payload 3.88 guarda los tamaños de
  -- upload en la columna jsonb "sizes" — Media no la tenía (se creó sin
  -- imageSizes) y production no usa push.
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "sizes" jsonb;
  -- Marcador de media temporal social: el job TTL SOLO purga assets marcados.
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "social_temp" boolean DEFAULT false;

  -- Estado 'publicando' del claim atómico de publicación (review Devin):
  -- sin esto, el update del claim falla en producción por enum desactualizado.
  ALTER TYPE "public"."enum_social_posts_status" ADD VALUE IF NOT EXISTS 'publicando';

  -- UNA fila de integración por tenant (doble create en /admin no duplica).
  CREATE UNIQUE INDEX IF NOT EXISTS "tenant_integrations_tenant_key" ON "tenant_integrations" USING btree ("tenant_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "tenant_integrations_tenant_key";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "purged_at";
  -- 'publicando' no se puede remover de un enum en Postgres: el down es no-op
  -- deliberado (el valor residual es inofensivo).`)
}
