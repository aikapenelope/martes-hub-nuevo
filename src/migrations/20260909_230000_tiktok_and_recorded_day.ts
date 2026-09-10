import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fase 4 — TikTok (doc ideas-futuras/06):
 * - `enum_social_accounts_platform` gana 'tiktok'.
 * - `post_metrics.recorded_day` (fecha sin hora): clave del unique
 *   (tenant, post, día) — garantía en BD de una fila de métricas por post y
 *   día (cierra el query-first sin índice de la fase 2).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TYPE "public"."enum_social_accounts_platform" ADD VALUE IF NOT EXISTS 'tiktok';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "post_metrics" ADD COLUMN IF NOT EXISTS "recorded_day" date;

  -- Backfill de filas existentes (si las hay) antes del unique.
  UPDATE "post_metrics" SET "recorded_day" = date_trunc('day', "recorded_at")::date WHERE "recorded_day" IS NULL;

  -- Deduplicación (review Devin): si el query-first de la fase 2 dejó dos
  -- filas el mismo día, el unique abortaría la migración. Se conserva la MÁS
  -- RECIENTE (mayor id — la última medición).
  DELETE FROM "post_metrics" a USING "post_metrics" b
  WHERE a."tenant_id" = b."tenant_id"
    AND a."post_id" = b."post_id"
    AND a."recorded_day" = b."recorded_day"
    AND a."id" < b."id";

  CREATE UNIQUE INDEX IF NOT EXISTS "post_metrics_tenant_post_day_idx" ON "post_metrics" USING btree ("tenant_id", "post_id", "recorded_day");
  CREATE INDEX IF NOT EXISTS "post_metrics_recorded_day_idx" ON "post_metrics" USING btree ("recorded_day");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "post_metrics_tenant_post_day_idx";
  DROP INDEX IF EXISTS "post_metrics_recorded_day_idx";
  ALTER TABLE "post_metrics" DROP COLUMN IF EXISTS "recorded_day";
  -- 'tiktok' no se puede remover del enum en Postgres: down no-op deliberado.`)
}
