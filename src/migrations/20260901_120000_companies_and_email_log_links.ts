import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fase A — interconexión del modelo de datos (nivel Twenty):
 *
 * 1. Nueva colección `companies`: cuenta/empresa separada del contacto, con
 *    multi-tenant, segmento y agente asignado.
 * 2. Relación `company` en `clients` y `leads` (columna + FK + índice).
 * 3. Relaciones `client`/`lead` en `email-log` (columna + FK + índice) para
 *    que cada email enviado quede vinculado a su ficha.
 * 4. Lock rel de `companies` en `payload_locked_documents_rels` (columna +
 *    FK cascade + índice) — mismo patrón que f5; sin ella, Payload no puede
 *    persistir el lock de documento al editar una empresa en /admin.
 *
 * Los join fields añadidos a clients/leads/companies son de solo lectura en
 * la API y no generan columnas. up() es idempotente (CREATE/COLUMN/INDEX con
 * IF NOT EXISTS y constraints guardadas por duplicate_object, mismo truco que
 * el CREATE TYPE de f3a).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "companies" (
    	"id" serial PRIMARY KEY NOT NULL,
    	"tenant_id" integer,
    	"name" varchar NOT NULL,
    	"tax_id" varchar,
    	"website" varchar,
    	"email" varchar,
    	"phone" varchar,
    	"city" varchar,
    	"state" varchar,
    	"address" varchar,
    	"google_maps_url" varchar,
    	"social_handle" varchar,
    	"commercial_notes" varchar,
    	"notes" varchar,
    	"segment_id" integer,
    	"assigned_agent_id" integer,
    	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    DO $$ BEGIN
      ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "companies" ADD CONSTRAINT "companies_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "companies" ADD CONSTRAINT "companies_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE INDEX IF NOT EXISTS "companies_tenant_idx" ON "companies" USING btree ("tenant_id");
    CREATE INDEX IF NOT EXISTS "companies_tax_id_idx" ON "companies" USING btree ("tax_id");
    CREATE INDEX IF NOT EXISTS "companies_email_idx" ON "companies" USING btree ("email");
    CREATE INDEX IF NOT EXISTS "companies_phone_idx" ON "companies" USING btree ("phone");

    -- Lock rel de companies (patrón f5): columna + FK cascade + índice
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "companies_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_companies_fk" FOREIGN KEY ("companies_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("companies_id");

    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "company_id" integer;
    DO $$ BEGIN
      ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "clients_company_idx" ON "clients" USING btree ("company_id");

    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_id" integer;
    DO $$ BEGIN
      ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "leads_company_idx" ON "leads" USING btree ("company_id");

    ALTER TABLE "email_log" ADD COLUMN IF NOT EXISTS "client_id" integer;
    ALTER TABLE "email_log" ADD COLUMN IF NOT EXISTS "lead_id" integer;
    DO $$ BEGIN
      ALTER TABLE "email_log" ADD CONSTRAINT "email_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "email_log" ADD CONSTRAINT "email_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "email_log_client_idx" ON "email_log" USING btree ("client_id");
    CREATE INDEX IF NOT EXISTS "email_log_lead_idx" ON "email_log" USING btree ("lead_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "email_log_lead_idx";
    DROP INDEX IF EXISTS "email_log_client_idx";
    ALTER TABLE "email_log" DROP CONSTRAINT IF EXISTS "email_log_lead_id_leads_id_fk";
    ALTER TABLE "email_log" DROP CONSTRAINT IF EXISTS "email_log_client_id_clients_id_fk";
    ALTER TABLE "email_log" DROP COLUMN IF EXISTS "lead_id";
    ALTER TABLE "email_log" DROP COLUMN IF EXISTS "client_id";

    DROP INDEX IF EXISTS "leads_company_idx";
    ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_company_id_companies_id_fk";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "company_id";

    DROP INDEX IF EXISTS "clients_company_idx";
    ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_company_id_companies_id_fk";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "company_id";

    -- Lock rels antes de dropear companies (dependencia por FK)
    DROP INDEX IF EXISTS "payload_locked_documents_rels_companies_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_companies_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "companies_id";

    DROP TABLE IF EXISTS "companies";
  `)
}
