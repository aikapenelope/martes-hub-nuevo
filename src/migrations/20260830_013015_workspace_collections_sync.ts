import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN CREATE TYPE "public"."enum_form_submissions_source" AS ENUM('tally', 'typeform', 'web', 'otro'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_tasks_status" AS ENUM('pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_tasks_priority" AS ENUM('baja', 'media', 'alta', 'urgente'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_tasks_source" AS ENUM('manual', 'tally_complaint', 'payment_overdue', 'openbsp_error', 'hermes_ai'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_tasks_kanban_status" AS ENUM('pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_conversation_summaries_sentiment" AS ENUM('positivo', 'neutral', 'negativo', 'en_riesgo'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_conversation_summaries_generated_by" AS ENUM('hermes_ai', 'openbsp_agent', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_social_accounts_platform" AS ENUM('instagram', 'facebook'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_social_accounts_status" AS ENUM('conectada', 'desconectada', 'expirada'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_social_posts_status" AS ENUM('borrador', 'programado', 'publicado', 'fallido'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_exports_format" AS ENUM('csv', 'json'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_exports_sort_order" AS ENUM('asc', 'desc'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_exports_drafts" AS ENUM('yes', 'no'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_imports_import_mode" AS ENUM('create', 'update', 'upsert'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'completed', 'partial', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'send-campaign-batch';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'send-scheduled-campaigns';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'publish-scheduled-posts';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'fetch-social-metrics';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'refresh-social-tokens';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'createCollectionImport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'send-campaign-batch';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'send-scheduled-campaigns';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'publish-scheduled-posts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'fetch-social-metrics';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'refresh-social-tokens';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'createCollectionExport';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'createCollectionImport';
  CREATE TABLE IF NOT EXISTS "form_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"form_name" varchar NOT NULL,
  	"form_id" varchar,
  	"source" "enum_form_submissions_source" DEFAULT 'tally' NOT NULL,
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
  
  CREATE TABLE IF NOT EXISTS "tasks_checklist" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL,
  	"done" boolean DEFAULT false
  );
  
  CREATE TABLE IF NOT EXISTS "tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"status" "enum_tasks_status" DEFAULT 'pendiente' NOT NULL,
  	"priority" "enum_tasks_priority" DEFAULT 'media' NOT NULL,
  	"due_date" timestamp(3) with time zone,
  	"assigned_to_id" integer,
  	"client_id" integer,
  	"lead_id" integer,
  	"source" "enum_tasks_source" DEFAULT 'manual',
  	"completed_at" timestamp(3) with time zone,
  	"kanban_status" "enum_tasks_kanban_status" DEFAULT 'pendiente',
  	"kanban_order_rank" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "conversation_summaries_key_topics" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"topic" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "conversation_summaries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"conversation_id" integer,
  	"client_id" integer,
  	"lead_id" integer,
  	"summary" varchar NOT NULL,
  	"sentiment" "enum_conversation_summaries_sentiment" DEFAULT 'neutral' NOT NULL,
  	"objections" varchar,
  	"next_steps" varchar,
  	"budget_expectation" varchar,
  	"generated_by" "enum_conversation_summaries_generated_by" DEFAULT 'hermes_ai',
  	"raw_ai_response" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "social_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"account_name" varchar NOT NULL,
  	"platform" "enum_social_accounts_platform" NOT NULL,
  	"platform_account_id" varchar NOT NULL,
  	"access_token" varchar NOT NULL,
  	"token_expires_at" timestamp(3) with time zone,
  	"status" "enum_social_accounts_status" DEFAULT 'conectada' NOT NULL,
  	"profile_picture_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "social_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"caption" varchar NOT NULL,
  	"account_id" integer NOT NULL,
  	"status" "enum_social_posts_status" DEFAULT 'borrador' NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"published_at" timestamp(3) with time zone,
  	"platform_post_id" varchar,
  	"permalink" varchar,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "social_posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "post_metrics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"post_id" integer NOT NULL,
  	"recorded_at" timestamp(3) with time zone NOT NULL,
  	"impressions" numeric DEFAULT 0,
  	"reach" numeric DEFAULT 0,
  	"likes" numeric DEFAULT 0,
  	"comments" numeric DEFAULT 0,
  	"shares" numeric DEFAULT 0,
  	"saved" numeric DEFAULT 0,
  	"raw_metrics" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"format" "enum_exports_format" DEFAULT 'csv' NOT NULL,
  	"limit" numeric,
  	"page" numeric DEFAULT 1,
  	"sort" varchar,
  	"sort_order" "enum_exports_sort_order",
  	"drafts" "enum_exports_drafts" DEFAULT 'yes',
  	"collection_slug" varchar DEFAULT 'leads' NOT NULL,
  	"where" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE IF NOT EXISTS "exports_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"collection_slug" varchar DEFAULT 'leads' NOT NULL,
  	"import_mode" "enum_imports_import_mode",
  	"match_field" varchar DEFAULT 'id',
  	"status" "enum_imports_status" DEFAULT 'pending',
  	"summary_imported" numeric,
  	"summary_updated" numeric,
  	"summary_total" numeric,
  	"summary_issues" numeric,
  	"summary_issue_details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE IF NOT EXISTS "payload_mcp_api_keys" (
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
  	"social_posts_find" boolean DEFAULT false,
  	"post_metrics_find" boolean DEFAULT false,
  	"users_find" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
  ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "tenant_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "form_submissions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tasks_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "conversation_summaries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "social_accounts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "social_posts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "post_metrics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "payload_mcp_api_keys_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN IF NOT EXISTS "payload_mcp_api_keys_id" integer;
  DO $$ BEGIN ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "tasks_checklist" ADD CONSTRAINT "tasks_checklist_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "conversation_summaries_key_topics" ADD CONSTRAINT "conversation_summaries_key_topics_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."conversation_summaries"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "social_posts_rels" ADD CONSTRAINT "social_posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "social_posts_rels" ADD CONSTRAINT "social_posts_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "exports_texts" ADD CONSTRAINT "exports_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_mcp_api_keys" ADD CONSTRAINT "payload_mcp_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "form_submissions_tenant_idx" ON "form_submissions" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "form_submissions_form_id_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX IF NOT EXISTS "form_submissions_client_idx" ON "form_submissions" USING btree ("client_id");
  CREATE INDEX IF NOT EXISTS "form_submissions_lead_idx" ON "form_submissions" USING btree ("lead_id");
  CREATE INDEX IF NOT EXISTS "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "tasks_checklist_order_idx" ON "tasks_checklist" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "tasks_checklist_parent_id_idx" ON "tasks_checklist" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "tasks_tenant_idx" ON "tasks" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "tasks_assigned_to_idx" ON "tasks" USING btree ("assigned_to_id");
  CREATE INDEX IF NOT EXISTS "tasks_client_idx" ON "tasks" USING btree ("client_id");
  CREATE INDEX IF NOT EXISTS "tasks_lead_idx" ON "tasks" USING btree ("lead_id");
  CREATE INDEX IF NOT EXISTS "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_key_topics_order_idx" ON "conversation_summaries_key_topics" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_key_topics_parent_id_idx" ON "conversation_summaries_key_topics" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_tenant_idx" ON "conversation_summaries" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_conversation_idx" ON "conversation_summaries" USING btree ("conversation_id");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_client_idx" ON "conversation_summaries" USING btree ("client_id");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_lead_idx" ON "conversation_summaries" USING btree ("lead_id");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_updated_at_idx" ON "conversation_summaries" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "conversation_summaries_created_at_idx" ON "conversation_summaries" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "social_accounts_tenant_idx" ON "social_accounts" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "social_accounts_updated_at_idx" ON "social_accounts" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "social_accounts_created_at_idx" ON "social_accounts" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "social_posts_tenant_idx" ON "social_posts" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "social_posts_account_idx" ON "social_posts" USING btree ("account_id");
  CREATE INDEX IF NOT EXISTS "social_posts_updated_at_idx" ON "social_posts" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "social_posts_created_at_idx" ON "social_posts" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "social_posts_rels_order_idx" ON "social_posts_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "social_posts_rels_parent_idx" ON "social_posts_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "social_posts_rels_path_idx" ON "social_posts_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "social_posts_rels_media_id_idx" ON "social_posts_rels" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "post_metrics_tenant_idx" ON "post_metrics" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "post_metrics_post_idx" ON "post_metrics" USING btree ("post_id");
  CREATE INDEX IF NOT EXISTS "post_metrics_updated_at_idx" ON "post_metrics" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "post_metrics_created_at_idx" ON "post_metrics" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "exports_updated_at_idx" ON "exports" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "exports_created_at_idx" ON "exports" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "exports_filename_idx" ON "exports" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "exports_texts_order_parent" ON "exports_texts" USING btree ("order","parent_id");
  CREATE INDEX IF NOT EXISTS "imports_updated_at_idx" ON "imports" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "imports_created_at_idx" ON "imports" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "imports_filename_idx" ON "imports" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "payload_mcp_api_keys_user_idx" ON "payload_mcp_api_keys" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "payload_mcp_api_keys_updated_at_idx" ON "payload_mcp_api_keys" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_mcp_api_keys_created_at_idx" ON "payload_mcp_api_keys" USING btree ("created_at");
  DO $$ BEGIN ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conversation_summaries_fk" FOREIGN KEY ("conversation_summaries_id") REFERENCES "public"."conversation_summaries"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_accounts_fk" FOREIGN KEY ("social_accounts_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_social_posts_fk" FOREIGN KEY ("social_posts_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_post_metrics_fk" FOREIGN KEY ("post_metrics_id") REFERENCES "public"."post_metrics"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  DO $$ BEGIN ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
  CREATE INDEX IF NOT EXISTS "clients_email_idx" ON "clients" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "clients_phone_idx" ON "clients" USING btree ("phone");
  CREATE INDEX IF NOT EXISTS "leads_phone_idx" ON "leads" USING btree ("phone");
  CREATE INDEX IF NOT EXISTS "leads_email_idx" ON "leads" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "conversations_contact_address_idx" ON "conversations" USING btree ("contact_address");
  CREATE INDEX IF NOT EXISTS "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "quotes_tenant_idx" ON "quotes" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_conversation_summaries_id_idx" ON "payload_locked_documents_rels" USING btree ("conversation_summaries_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_social_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_accounts_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_social_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("social_posts_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_post_metrics_id_idx" ON "payload_locked_documents_rels" USING btree ("post_metrics_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_payload_mcp_api_keys_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_mcp_api_keys_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_payload_mcp_api_keys_id_idx" ON "payload_preferences_rels" USING btree ("payload_mcp_api_keys_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "form_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks_checklist" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "conversation_summaries_key_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "conversation_summaries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "social_posts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "post_metrics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "imports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_mcp_api_keys" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "form_submissions" CASCADE;
  DROP TABLE "tasks_checklist" CASCADE;
  DROP TABLE "tasks" CASCADE;
  DROP TABLE "conversation_summaries_key_topics" CASCADE;
  DROP TABLE "conversation_summaries" CASCADE;
  DROP TABLE "social_accounts" CASCADE;
  DROP TABLE "social_posts" CASCADE;
  DROP TABLE "social_posts_rels" CASCADE;
  DROP TABLE "post_metrics" CASCADE;
  DROP TABLE "exports" CASCADE;
  DROP TABLE "exports_texts" CASCADE;
  DROP TABLE "imports" CASCADE;
  DROP TABLE "payload_mcp_api_keys" CASCADE;
  ALTER TABLE "invoices" DROP CONSTRAINT "invoices_tenant_id_tenants_id_fk";
  
  ALTER TABLE "quotes" DROP CONSTRAINT "quotes_tenant_id_tenants_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tasks_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_conversation_summaries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_accounts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_social_posts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_post_metrics_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'payment-reminders', 'daily-digest', 'sync-templates', 'openbsp-error-poll');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'payment-reminders', 'daily-digest', 'sync-templates', 'openbsp-error-poll');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "clients_email_idx";
  DROP INDEX "clients_phone_idx";
  DROP INDEX "leads_phone_idx";
  DROP INDEX "leads_email_idx";
  DROP INDEX "conversations_contact_address_idx";
  DROP INDEX "invoices_tenant_idx";
  DROP INDEX "quotes_tenant_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_tasks_id_idx";
  DROP INDEX "payload_locked_documents_rels_conversation_summaries_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_accounts_id_idx";
  DROP INDEX "payload_locked_documents_rels_social_posts_id_idx";
  DROP INDEX "payload_locked_documents_rels_post_metrics_id_idx";
  DROP INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx";
  DROP INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx";
  ALTER TABLE "invoices" DROP COLUMN "tenant_id";
  ALTER TABLE "quotes" DROP COLUMN "tenant_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tasks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "conversation_summaries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_accounts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "social_posts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "post_metrics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payload_mcp_api_keys_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "payload_mcp_api_keys_id";
  DROP TYPE "public"."enum_form_submissions_source";
  DROP TYPE "public"."enum_tasks_status";
  DROP TYPE "public"."enum_tasks_priority";
  DROP TYPE "public"."enum_tasks_source";
  DROP TYPE "public"."enum_tasks_kanban_status";
  DROP TYPE "public"."enum_conversation_summaries_sentiment";
  DROP TYPE "public"."enum_conversation_summaries_generated_by";
  DROP TYPE "public"."enum_social_accounts_platform";
  DROP TYPE "public"."enum_social_accounts_status";
  DROP TYPE "public"."enum_social_posts_status";
  DROP TYPE "public"."enum_exports_format";
  DROP TYPE "public"."enum_exports_sort_order";
  DROP TYPE "public"."enum_exports_drafts";
  DROP TYPE "public"."enum_imports_import_mode";
  DROP TYPE "public"."enum_imports_status";`)
}
