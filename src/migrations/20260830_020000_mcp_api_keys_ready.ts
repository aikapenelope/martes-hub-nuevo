import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Causa raíz del error 500 en `/admin`: el plugin oficial `@payloadcms/plugin-mcp`
 * registra su propia colección `payload-mcp-api-keys` desde que se agregó en F9,
 * pero nunca tuvo migración (confirmado: ninguna migración anterior la menciona).
 * Payload consulta `payload_preferences`/`payload_locked_documents` en casi cada
 * carga del panel admin (preferencias de usuario, bloqueo de documentos), y esas
 * consultas referencian la columna `payload_mcp_api_keys_id` en
 * `payload_preferences_rels`/`payload_locked_documents_rels` — columna que nunca
 * existió en la base real, de ahí el error de servidor al entrar a `/admin`.
 *
 * Esquema verificado con `payload generate:db-schema` contra la config actual
 * (no requiere Postgres real), mismo procedimiento que
 * `20260830_010000_social_mcp_ready`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload_mcp_api_keys" (
   "id" serial PRIMARY KEY NOT NULL,
   "user_id" integer NOT NULL,
   "label" varchar,
   "description" varchar,
   "clients_find" boolean DEFAULT false,
   "clients_create" boolean DEFAULT false,
   "clients_update" boolean DEFAULT false,
   "clients_delete" boolean DEFAULT false,
   "leads_find" boolean DEFAULT false,
   "leads_create" boolean DEFAULT false,
   "leads_update" boolean DEFAULT false,
   "leads_delete" boolean DEFAULT false,
   "tasks_find" boolean DEFAULT false,
   "tasks_create" boolean DEFAULT false,
   "tasks_update" boolean DEFAULT false,
   "tasks_delete" boolean DEFAULT false,
   "payments_find" boolean DEFAULT false,
   "invoices_find" boolean DEFAULT false,
   "quotes_find" boolean DEFAULT false,
   "conversation_summaries_find" boolean DEFAULT false,
   "conversation_summaries_create" boolean DEFAULT false,
   "conversation_summaries_update" boolean DEFAULT false,
   "media_find" boolean DEFAULT false,
   "media_create" boolean DEFAULT false,
   "social_accounts_find" boolean DEFAULT false,
   "social_posts_find" boolean DEFAULT false,
   "social_posts_create" boolean DEFAULT false,
   "social_posts_update" boolean DEFAULT false,
   "post_metrics_find" boolean DEFAULT false,
   "post_metrics_create" boolean DEFAULT false,
   "post_metrics_update" boolean DEFAULT false,
   "users_find" boolean DEFAULT false,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "enable_a_p_i_key" boolean,
   "api_key" varchar,
   "api_key_index" varchar
  );
  ALTER TABLE "payload_mcp_api_keys" ADD CONSTRAINT "payload_mcp_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_mcp_api_keys_user_idx" ON "payload_mcp_api_keys" USING btree ("user_id");
  CREATE INDEX "payload_mcp_api_keys_updated_at_idx" ON "payload_mcp_api_keys" USING btree ("updated_at");
  CREATE INDEX "payload_mcp_api_keys_created_at_idx" ON "payload_mcp_api_keys" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_mcp_api_keys_id");

  ALTER TABLE "payload_preferences_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx" ON "payload_preferences_rels" USING btree ("payload_mcp_api_keys_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk";
  DROP INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "payload_mcp_api_keys_id";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk";
  DROP INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payload_mcp_api_keys_id";

  DROP TABLE "payload_mcp_api_keys";`)
}
