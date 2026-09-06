import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * add_notes_collection — colección `notes` (notas enriquecidas del equipo):
 * tabla + enum de categorías + índices multi-tenant, más la columna
 * `notes_id` en `payload_locked_documents_rels` (tabla interna de Payload).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_notes_category" AS ENUM('general', 'cliente', 'reunion', 'seguimiento', 'idea', 'recordatorio');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS "notes" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "title" varchar NOT NULL,
    "body" jsonb NOT NULL,
    "category" "enum_notes_category" DEFAULT 'general',
    "pinned" boolean DEFAULT false,
    "client_id" integer,
    "lead_id" integer,
    "author_id" integer,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "notes_tenant_idx" ON "notes" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "notes_client_idx" ON "notes" USING btree ("client_id");
  CREATE INDEX IF NOT EXISTS "notes_lead_idx" ON "notes" USING btree ("lead_id");
  CREATE INDEX IF NOT EXISTS "notes_author_idx" ON "notes" USING btree ("author_id");
  CREATE INDEX IF NOT EXISTS "notes_updated_at_idx" ON "notes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "notes_created_at_idx" ON "notes" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "notes_id" integer;
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("notes_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload_locked_documents_rels_notes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_notes_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "notes_id";
  DROP INDEX IF EXISTS "notes_updated_at_idx";
  DROP INDEX IF EXISTS "notes_created_at_idx";
  DROP INDEX IF EXISTS "notes_author_idx";
  DROP INDEX IF EXISTS "notes_lead_idx";
  DROP INDEX IF EXISTS "notes_client_idx";
  DROP INDEX IF EXISTS "notes_tenant_idx";
  DROP TABLE IF EXISTS "notes";
  DROP TYPE IF EXISTS "enum_notes_category";
  `)
}
