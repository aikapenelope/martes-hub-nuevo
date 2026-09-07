import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Colección lead-briefs: brief 360 IA por lead (upsert del más reciente).
// Campos planos + relaciones a leads/tenants — sin arrays ni grupos.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'generate-lead-brief';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'generate-lead-brief';
    CREATE TYPE "public"."enum_lead_briefs_sentiment" AS ENUM('positivo', 'neutral', 'negativo');
    CREATE TABLE "lead_briefs" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "lead_id" integer NOT NULL,
      "summary" varchar,
      "senales" varchar,
      "sentiment" "enum_lead_briefs_sentiment",
      "proxima_accion" varchar,
      "mensaje_whatsapp" varchar,
      "model" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "lead_briefs" ADD CONSTRAINT "lead_briefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "lead_briefs" ADD CONSTRAINT "lead_briefs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "lead_briefs_tenant_idx" ON "lead_briefs" USING btree ("tenant_id");
    CREATE INDEX "lead_briefs_lead_idx" ON "lead_briefs" USING btree ("lead_id");
    CREATE INDEX "lead_briefs_created_at_idx" ON "lead_briefs" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "lead_briefs_id" integer;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "lead_briefs" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_lead_briefs_sentiment";
  `)
}
