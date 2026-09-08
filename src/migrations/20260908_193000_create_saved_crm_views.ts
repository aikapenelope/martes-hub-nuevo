import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Vistas guardadas del CRM (ítem 4): filtros privados por usuario.
// Delta manual — el snapshot de drizzle no refleja el estado real de la BD
// (todas las migraciones de este repo son manuales). Unicidad de nombre por
// (tenant, usuario) vía índice único.
// El down no revierte tipos ENUM (patrón add_lead_briefs).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_saved_crm_views_vista" AS ENUM('leads', 'clientes', 'empresas');
    CREATE TYPE "public"."enum_saved_crm_views_modo" AS ENUM('pipeline', 'tabla');
    CREATE TABLE "saved_crm_views" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "name" varchar NOT NULL,
      "created_by_id" integer NOT NULL,
      "vista" "enum_saved_crm_views_vista" NOT NULL,
      "modo" "enum_saved_crm_views_modo" DEFAULT 'pipeline' NOT NULL,
      "q" varchar,
      "estado" varchar,
      "fuente" varchar,
      "agente" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "saved_crm_views" ADD CONSTRAINT "saved_crm_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "saved_crm_views" ADD CONSTRAINT "saved_crm_views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "saved_crm_views_tenant_idx" ON "saved_crm_views" USING btree ("tenant_id");
    CREATE INDEX "saved_crm_views_created_by_idx" ON "saved_crm_views" USING btree ("created_by_id");
    CREATE INDEX "saved_crm_views_updated_at_idx" ON "saved_crm_views" USING btree ("updated_at");
    CREATE INDEX "saved_crm_views_created_at_idx" ON "saved_crm_views" USING btree ("created_at");
    CREATE UNIQUE INDEX "saved_crm_views_tenant_owner_name_idx" ON "saved_crm_views" ("tenant_id","created_by_id","name");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "saved_crm_views_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_saved_crm_views_fk" FOREIGN KEY ("saved_crm_views_id") REFERENCES "public"."saved_crm_views"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_saved_crm_views_id_idx" ON "payload_locked_documents_rels" USING btree ("saved_crm_views_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "saved_crm_views" CASCADE;
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "saved_crm_views_id";
  `)
}
