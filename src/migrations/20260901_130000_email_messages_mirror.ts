import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fase B — espejo de solo lectura del buzón (`email-messages`).
 * Lo escribe únicamente el job `sync-email` (Gmail read-only, idempotente
 * por provider_id); el envío real sigue siendo Resend y vive en `email-log`.
 * up() es idempotente (mismo patrón que el resto de migraciones del repo).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_email_messages_direction" AS ENUM ('inbound', 'outbound');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "email_messages" (
    	"id" serial PRIMARY KEY NOT NULL,
    	"tenant_id" integer,
    	"direction" "enum_email_messages_direction" DEFAULT 'inbound' NOT NULL,
    	"provider_id" varchar NOT NULL,
    	"thread_id" varchar,
    	"from_email" varchar,
    	"from_name" varchar,
    	"to_emails" varchar,
    	"cc_emails" varchar,
    	"subject" varchar,
    	"snippet" varchar,
    	"date" timestamp(3) with time zone NOT NULL,
    	"client_id" integer,
    	"lead_id" integer,
    	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "email_messages_tenant_idx" ON "email_messages" USING btree ("tenant_id");
    CREATE INDEX IF NOT EXISTS "email_messages_provider_id_idx" ON "email_messages" USING btree ("provider_id");
    CREATE INDEX IF NOT EXISTS "email_messages_thread_id_idx" ON "email_messages" USING btree ("thread_id");
    CREATE INDEX IF NOT EXISTS "email_messages_from_email_idx" ON "email_messages" USING btree ("from_email");
    CREATE INDEX IF NOT EXISTS "email_messages_date_idx" ON "email_messages" USING btree ("date");
    CREATE INDEX IF NOT EXISTS "email_messages_client_idx" ON "email_messages" USING btree ("client_id");
    CREATE INDEX IF NOT EXISTS "email_messages_lead_idx" ON "email_messages" USING btree ("lead_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "email_messages";
    DROP TYPE IF EXISTS "enum_email_messages_direction";
  `)
}
