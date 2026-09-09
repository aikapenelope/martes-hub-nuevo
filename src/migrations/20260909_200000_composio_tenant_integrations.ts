import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Integraciones Composio BYO-key (doc ideas-futuras/01 v4):
 * - `tenant_integrations`: la API key del proyecto Composio del tenant, cifrada
 *   (AES-GCM en app) — UNA fila por tenant (índice único en tenant_id).
 * - `tenant_connections`: estado de conexión por (tenant, toolkit) — índice
 *   único en (tenant_id, toolkit); guarda auth config, connected account y
 *   config propia (ej. calendarId).
 * - `social_accounts`: columnas de la conexión Composio (connected account,
 *   external user id, estado de sync, último sync).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_tenant_integrations_provider" AS ENUM('composio');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_tenant_integrations_estado" AS ENUM('ok', 'invalida');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_tenant_connections_toolkit" AS ENUM('instagram', 'tiktok', 'gmail', 'googlecalendar', 'googlesheets', 'googledocs');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_tenant_connections_scope" AS ENUM('empresa', 'personal');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_tenant_connections_estado" AS ENUM('conectando', 'ok', 'error_token', 'error_api', 'desconectado');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_social_accounts_sync_status" AS ENUM('sin_conectar', 'ok', 'error_token', 'error_api');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "tenant_integrations" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "provider" "public"."enum_tenant_integrations_provider" DEFAULT 'composio' NOT NULL,
   "api_key_cifrado" text NOT NULL,
   "estado" "public"."enum_tenant_integrations_estado" DEFAULT 'ok' NOT NULL,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX IF NOT EXISTS "tenant_integrations_tenant_idx" ON "tenant_integrations" USING btree ("tenant_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "tenant_integrations_tenant_id_key" ON "tenant_integrations" USING btree ("tenant_id");
  ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;

  CREATE TABLE IF NOT EXISTS "tenant_connections" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "toolkit" "public"."enum_tenant_connections_toolkit" NOT NULL,
   "scope" "public"."enum_tenant_connections_scope" DEFAULT 'empresa' NOT NULL,
   "user_id" integer,
   "auth_config_id" varchar,
   "connected_account_id" varchar,
   "connected_by_id" integer,
   "estado" "public"."enum_tenant_connections_estado" DEFAULT 'conectando' NOT NULL,
   "ultimo_error" text,
   "config" jsonb,
   "last_sync_at" timestamp(3) with time zone,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX IF NOT EXISTS "tenant_connections_tenant_idx" ON "tenant_connections" USING btree ("tenant_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "tenant_connections_tenant_scope_toolkit_user_key" ON "tenant_connections" USING btree ("tenant_id", "toolkit", "scope", "user_id");
  ALTER TABLE "tenant_connections" ADD CONSTRAINT "tenant_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenant_connections" ADD CONSTRAINT "tenant_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenant_connections" ADD CONSTRAINT "tenant_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "composio_connected_account_id" varchar;
  ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "external_user_id" varchar;
  ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "sync_status" "public"."enum_social_accounts_sync_status" DEFAULT 'sin_conectar';
  ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp(3) with time zone;

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tenant_integrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tenant_connections_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenant_integrations_fk" FOREIGN KEY ("tenant_integrations_id") REFERENCES "public"."tenant_integrations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenant_connections_fk" FOREIGN KEY ("tenant_connections_id") REFERENCES "public"."tenant_connections"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tenant_integrations_id_idx" ON "payload_locked_documents_rels" USING btree ("tenant_integrations_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tenant_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("tenant_connections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tenant_integrations_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tenant_connections_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tenant_integrations_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tenant_connections_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tenant_integrations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "tenant_connections_id";

  ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "composio_connected_account_id";
  ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "external_user_id";
  ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "sync_status";
  ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "last_sync_at";
  DROP TYPE IF EXISTS "public"."enum_social_accounts_sync_status";

  DROP TABLE IF EXISTS "tenant_connections";
  DROP TABLE IF EXISTS "tenant_integrations";

  DROP TYPE IF EXISTS "public"."enum_tenant_connections_scope";
  DROP TYPE IF EXISTS "public"."enum_tenant_connections_estado";
  DROP TYPE IF EXISTS "public"."enum_tenant_connections_toolkit";
  DROP TYPE IF EXISTS "public"."enum_tenant_integrations_estado";
  DROP TYPE IF EXISTS "public"."enum_tenant_integrations_provider";`)
}
