import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Modelo de conversación estilo Chatwoot (PR Fase B):
 * - Conversations: status (open/pending/resolved), priority, assignee,
 *   snoozeUntil y labels (tabla conversations_labels del select hasMany).
 * - Nueva colección conversation_notes (notas internas privadas).
 *
 * Por qué manual y no `migrate:create`: el diff automático de drizzle arrastra
 * drift histórico del import-export plugin (re-crearía `exports`/`imports`)
 * y eliminaría los índices de performance de 050000 creados con SQL raw.
 * up() es idempotente (mismo patrón que el resto del repo).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Enums nuevos
    DO $$ BEGIN
      CREATE TYPE "public"."enum_conversations_status" AS ENUM('open', 'pending', 'resolved');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_conversations_priority" AS ENUM('baja', 'media', 'alta');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_conversations_labels" AS ENUM('seguimiento', 'facturacion', 'soporte', 'renovacion', 'urgente', 'oportunidad');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Conversaciones: estado Chatwoot
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "status" "public"."enum_conversations_status" DEFAULT 'open' NOT NULL;
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "priority" "public"."enum_conversations_priority" DEFAULT 'media' NOT NULL;
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "assignee_id" integer;
    ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "snooze_until" timestamp(3) with time zone;

    DO $$ BEGIN
      ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "conversations_status_idx" ON "conversations" USING btree ("status");
    CREATE INDEX IF NOT EXISTS "conversations_assignee_idx" ON "conversations" USING btree ("assignee_id");

    -- Labels del select hasMany (tabla relacional de Payload)
    CREATE TABLE IF NOT EXISTS "conversations_labels" (
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "value" "public"."enum_conversations_labels",
      "id" serial PRIMARY KEY NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "conversations_labels" ADD CONSTRAINT "conversations_labels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "conversations_labels_order_idx" ON "conversations_labels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "conversations_labels_parent_idx" ON "conversations_labels" USING btree ("parent_id");

    -- Notas internas privadas
    CREATE TABLE IF NOT EXISTS "conversation_notes" (
      "id" serial PRIMARY KEY NOT NULL,
      "tenant_id" integer,
      "conversation_id" integer NOT NULL,
      "body" varchar NOT NULL,
      "author_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    -- Columna de relación para el sistema de locks de Payload (update/delete)
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "conversation_notes_id" integer;
    DO $$ BEGIN
      ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE INDEX IF NOT EXISTS "conversation_notes_tenant_idx" ON "conversation_notes" USING btree ("tenant_id");
    CREATE INDEX IF NOT EXISTS "conversation_notes_conversation_idx" ON "conversation_notes" USING btree ("conversation_id");
    CREATE INDEX IF NOT EXISTS "conversation_notes_author_idx" ON "conversation_notes" USING btree ("author_id");
    CREATE INDEX IF NOT EXISTS "conversation_notes_created_at_idx" ON "conversation_notes" USING btree ("created_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "conversation_notes" CASCADE;
    DROP TABLE IF EXISTS "conversations_labels" CASCADE;
    DROP INDEX IF EXISTS "conversations_status_idx";
    DROP INDEX IF EXISTS "conversations_assignee_idx";
    ALTER TABLE "conversations" DROP COLUMN IF EXISTS "status";
    ALTER TABLE "conversations" DROP COLUMN IF EXISTS "priority";
    ALTER TABLE "conversations" DROP COLUMN IF EXISTS "assignee_id";
    ALTER TABLE "conversations" DROP COLUMN IF EXISTS "snooze_until";
    DROP TYPE IF EXISTS "public"."enum_conversations_labels";
    DROP TYPE IF EXISTS "public"."enum_conversations_priority";
    DROP TYPE IF EXISTS "public"."enum_conversations_status";
  `)
}
