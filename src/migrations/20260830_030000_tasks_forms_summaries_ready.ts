import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `tasks`, `form-submissions` y `conversation-summaries` nunca tuvieron
 * migración propia (confirmado: ninguna migración anterior las menciona),
 * a pesar de estar en `payload.config.ts` desde F8/F9 — mismo tipo de gap
 * que `social-accounts`/`social-posts`/`post-metrics` (20260830_010000) y
 * `payload-mcp-api-keys` (20260830_020000). Esta migración:
 *
 * 1. Crea las 3 tablas + sus subtablas de array (`tasks_checklist`,
 *    `conversation_summaries_key_topics`), con el esquema verificado vía
 *    `payload generate:db-schema` contra la config actual.
 * 2. Agrega a `enum_payload_jobs_task_slug`/`enum_payload_jobs_log_task_slug`
 *    los slugs `send-campaign-batch` y `send-scheduled-campaigns`, usados
 *    por jobs ya registrados en `payload.config.ts` pero cuyo valor de
 *    enum nunca se agregó — cualquier ejecución real de esos jobs fallaría
 *    al intentar escribir la fila en `payload_jobs`/`payload_jobs_log`.
 * 3. Agrega las columnas `form_submissions_id`/`tasks_id`/
 *    `conversation_summaries_id` a `payload_locked_documents_rels`
 *    (mismo patrón que las migraciones anteriores de este mismo gap).
 * 4. Agrega los índices de `clients.email`/`clients.phone`/`leads.phone`/
 *    `leads.email`/`conversations.contactAddress` — declarados con
 *    `index: true` en el código desde antes pero nunca creados en la BD.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_form_submissions_source" AS ENUM('tally', 'typeform', 'web', 'otro');
  CREATE TYPE "public"."enum_tasks_status" AS ENUM('pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada');
  CREATE TYPE "public"."enum_tasks_priority" AS ENUM('baja', 'media', 'alta', 'urgente');
  CREATE TYPE "public"."enum_tasks_source" AS ENUM('manual', 'tally_complaint', 'payment_overdue', 'openbsp_error', 'hermes_ai');
  CREATE TYPE "public"."enum_tasks_kanban_status" AS ENUM('pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada');
  CREATE TYPE "public"."enum_conversation_summaries_sentiment" AS ENUM('positivo', 'neutral', 'negativo', 'en_riesgo');
  CREATE TYPE "public"."enum_conversation_summaries_generated_by" AS ENUM('hermes_ai', 'openbsp_agent', 'manual');
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'send-campaign-batch';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'send-scheduled-campaigns';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'send-campaign-batch';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'send-scheduled-campaigns';

  CREATE TABLE "form_submissions" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "form_name" varchar NOT NULL,
   "form_id" varchar,
   "source" "public"."enum_form_submissions_source" DEFAULT 'tally' NOT NULL,
   "respondent_name" varchar,
   "respondent_email" varchar,
   "respondent_phone" varchar,
   "client_id" integer,
   "lead_id" integer,
   "is_complaint" boolean DEFAULT false,
   "answers_json" jsonb,
   "raw_payload" jsonb,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "form_submissions_tenant_idx" ON "form_submissions" USING btree ("tenant_id");
  CREATE INDEX "form_submissions_form_id_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_client_idx" ON "form_submissions" USING btree ("client_id");
  CREATE INDEX "form_submissions_lead_idx" ON "form_submissions" USING btree ("lead_id");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");

  CREATE TABLE "tasks" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "title" varchar NOT NULL,
   "description" varchar,
   "status" "public"."enum_tasks_status" DEFAULT 'pendiente' NOT NULL,
   "priority" "public"."enum_tasks_priority" DEFAULT 'media' NOT NULL,
   "due_date" timestamp(3) with time zone,
   "assigned_to_id" integer,
   "client_id" integer,
   "lead_id" integer,
   "source" "public"."enum_tasks_source" DEFAULT 'manual',
   "completed_at" timestamp(3) with time zone,
   "kanban_status" "public"."enum_tasks_kanban_status" DEFAULT 'pendiente',
   "kanban_order_rank" varchar,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tasks_tenant_idx" ON "tasks" USING btree ("tenant_id");
  CREATE INDEX "tasks_assigned_to_idx" ON "tasks" USING btree ("assigned_to_id");
  CREATE INDEX "tasks_client_idx" ON "tasks" USING btree ("client_id");
  CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");
  CREATE INDEX "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");

  CREATE TABLE "tasks_checklist" (
   "_order" integer NOT NULL,
   "_parent_id" integer NOT NULL,
   "id" varchar PRIMARY KEY NOT NULL,
   "item" varchar NOT NULL,
   "done" boolean DEFAULT false
  );
  ALTER TABLE "tasks_checklist" ADD CONSTRAINT "tasks_checklist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tasks_checklist_order_idx" ON "tasks_checklist" USING btree ("_order");
  CREATE INDEX "tasks_checklist_parent_id_idx" ON "tasks_checklist" USING btree ("_parent_id");

  CREATE TABLE "conversation_summaries" (
   "id" serial PRIMARY KEY NOT NULL,
   "tenant_id" integer,
   "title" varchar NOT NULL,
   "conversation_id" integer,
   "client_id" integer,
   "lead_id" integer,
   "summary" varchar NOT NULL,
   "sentiment" "public"."enum_conversation_summaries_sentiment" DEFAULT 'neutral' NOT NULL,
   "objections" varchar,
   "next_steps" varchar,
   "budget_expectation" varchar,
   "generated_by" "public"."enum_conversation_summaries_generated_by" DEFAULT 'hermes_ai',
   "raw_ai_response" jsonb,
   "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
   "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "conversation_summaries_tenant_idx" ON "conversation_summaries" USING btree ("tenant_id");
  CREATE INDEX "conversation_summaries_conversation_idx" ON "conversation_summaries" USING btree ("conversation_id");
  CREATE INDEX "conversation_summaries_client_idx" ON "conversation_summaries" USING btree ("client_id");
  CREATE INDEX "conversation_summaries_lead_idx" ON "conversation_summaries" USING btree ("lead_id");
  CREATE INDEX "conversation_summaries_updated_at_idx" ON "conversation_summaries" USING btree ("updated_at");
  CREATE INDEX "conversation_summaries_created_at_idx" ON "conversation_summaries" USING btree ("created_at");

  CREATE TABLE "conversation_summaries_key_topics" (
   "_order" integer NOT NULL,
   "_parent_id" integer NOT NULL,
   "id" varchar PRIMARY KEY NOT NULL,
   "topic" varchar NOT NULL
  );
  ALTER TABLE "conversation_summaries_key_topics" ADD CONSTRAINT "conversation_summaries_key_topics_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."conversation_summaries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "conversation_summaries_key_topics_order_idx" ON "conversation_summaries_key_topics" USING btree ("_order");
  CREATE INDEX "conversation_summaries_key_topics_parent_id_idx" ON "conversation_summaries_key_topics" USING btree ("_parent_id");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_submissions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tasks_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "conversation_summaries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conversation_summaries_fk" FOREIGN KEY ("conversation_summaries_id") REFERENCES "public"."conversation_summaries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
  CREATE INDEX "payload_locked_documents_rels_conversation_summaries_id_idx" ON "payload_locked_documents_rels" USING btree ("conversation_summaries_id");

  CREATE INDEX "clients_email_idx" ON "clients" USING btree ("email");
  CREATE INDEX "clients_phone_idx" ON "clients" USING btree ("phone");
  CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");
  CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");
  CREATE INDEX "conversations_contact_address_idx" ON "conversations" USING btree ("contact_address");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "conversations_contact_address_idx";
  DROP INDEX "leads_email_idx";
  DROP INDEX "leads_phone_idx";
  DROP INDEX "clients_phone_idx";
  DROP INDEX "clients_email_idx";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_conversation_summaries_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tasks_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  DROP INDEX "payload_locked_documents_rels_conversation_summaries_id_idx";
  DROP INDEX "payload_locked_documents_rels_tasks_id_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "conversation_summaries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tasks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_submissions_id";

  DROP TABLE "conversation_summaries_key_topics";
  DROP TABLE "conversation_summaries";
  DROP TABLE "tasks_checklist";
  DROP TABLE "tasks";
  DROP TABLE "form_submissions";

  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'payment-reminders', 'daily-digest', 'sync-templates', 'openbsp-error-poll', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'payment-reminders', 'daily-digest', 'sync-templates', 'openbsp-error-poll', 'createCollectionExport', 'createCollectionImport');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";

  DROP TYPE "public"."enum_conversation_summaries_generated_by";
  DROP TYPE "public"."enum_conversation_summaries_sentiment";
  DROP TYPE "public"."enum_tasks_kanban_status";
  DROP TYPE "public"."enum_tasks_source";
  DROP TYPE "public"."enum_tasks_priority";
  DROP TYPE "public"."enum_tasks_status";
  DROP TYPE "public"."enum_form_submissions_source";`)
}

