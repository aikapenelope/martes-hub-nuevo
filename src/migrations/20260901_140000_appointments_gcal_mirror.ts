import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fase C — espejo de solo lectura del calendario de citas (`appointments`).
 * Lo escribe únicamente el job `sync-gcal` (Google Calendar read-only,
 * idempotente por gcal_event_id, upsert de cancelaciones). up() es
 * idempotente (mismo patrón que el resto de migraciones del repo).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_appointments_status" AS ENUM ('confirmed', 'tentative', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "appointments" (
    	"id" serial PRIMARY KEY NOT NULL,
    	"tenant_id" integer,
    	"title" varchar NOT NULL,
    	"start" timestamp(3) with time zone NOT NULL,
    	"end_date" timestamp(3) with time zone,
    	"all_day" boolean DEFAULT false,
    	"status" "enum_appointments_status" DEFAULT 'confirmed' NOT NULL,
    	"location" varchar,
    	"attendees" varchar,
    	"description" varchar,
    	"gcal_event_id" varchar NOT NULL,
    	"calendar_id" varchar,
    	"html_link" varchar,
    	"client_id" integer,
    	"lead_id" integer,
    	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "appointments_tenant_idx" ON "appointments" USING btree ("tenant_id");
    CREATE INDEX IF NOT EXISTS "appointments_start_idx" ON "appointments" USING btree ("start");
    CREATE INDEX IF NOT EXISTS "appointments_gcal_event_id_idx" ON "appointments" USING btree ("gcal_event_id");
    CREATE INDEX IF NOT EXISTS "appointments_client_idx" ON "appointments" USING btree ("client_id");
    CREATE INDEX IF NOT EXISTS "appointments_lead_idx" ON "appointments" USING btree ("lead_id");

    -- Lock rel de appointments (patrón f5)
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "appointments_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_appointments_fk" FOREIGN KEY ("appointments_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_appointments_id_idx" ON "payload_locked_documents_rels" USING btree ("appointments_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_appointments_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_appointments_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "appointments_id";

    DROP TABLE IF EXISTS "appointments";
    DROP TYPE IF EXISTS "enum_appointments_status";
  `)
}
