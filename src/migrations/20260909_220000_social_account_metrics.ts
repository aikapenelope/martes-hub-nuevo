import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Métricas diarias de cuentas sociales (doc 01 v3): tabla
 * `social_account_metrics` — 1 fila por (tenant, cuenta, fecha), escrita por
 * el job `sync-instagram-metrics` vía Composio. Alimenta el sparkline de
 * seguidores y las tarjetas de cuenta del Social Hub.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "social_account_metrics" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "social_account_id" integer,
   "recorded_at" timestamp(3) with time zone NOT NULL,
   "follower_count" numeric DEFAULT '0' NOT NULL,
   "profile_views" numeric DEFAULT '0' NOT NULL,
   "website_clicks" numeric DEFAULT '0' NOT NULL,
   "reach" numeric DEFAULT '0' NOT NULL,
   "raw_metrics" jsonb,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX IF NOT EXISTS "social_account_metrics_tenant_idx" ON "social_account_metrics" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "social_account_metrics_social_account_idx" ON "social_account_metrics" USING btree ("social_account_id");
  CREATE INDEX IF NOT EXISTS "social_account_metrics_recorded_at_idx" ON "social_account_metrics" USING btree ("recorded_at");
  ALTER TABLE "social_account_metrics" ADD CONSTRAINT "social_account_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "social_account_metrics" ADD CONSTRAINT "social_account_metrics_social_account_id_social_accoun_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "social_account_metrics_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_account_metrics_fk" FOREIGN KEY ("social_account_metrics_id") REFERENCES "public"."social_account_metrics"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_social_account_metrics_id_idx" ON "payload_locked_documents_rels" USING btree ("social_account_metrics_id");

  -- Unicidad de citas consciente de la fuente (review Devin): empresa y
  -- personales pueden usar calendarId 'primary' — (tenant, gcal_event_id) ya
  -- no identifica una cita. Filas legacy (source NULL) quedan fuera del
  -- unique (NULLS DISTINCT) y siguen actualizándose por el camino legacy.
  DROP INDEX IF EXISTS "appointments_tenant_gcal_event_id_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "appointments_tenant_source_gcal_event_id_idx" ON "appointments" USING btree ("tenant_id", "source_connection_id", "gcal_event_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_social_account_metrics_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_social_account_metrics_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "social_account_metrics_id";

  DROP TABLE IF EXISTS "social_account_metrics";

  DROP INDEX IF EXISTS "appointments_tenant_source_gcal_event_id_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "appointments_tenant_gcal_event_id_idx" ON "appointments" USING btree ("tenant_id", "gcal_event_id");`)
}
