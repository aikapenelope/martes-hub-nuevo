import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_conversations_channel" AS ENUM('whatsapp', 'instagram_dm', 'whatsapp_web');
  CREATE TYPE "public"."enum_messages_direction" AS ENUM('inbound', 'outbound');
  CREATE TYPE "public"."enum_messages_type" AS ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'template', 'location', 'contacts', 'unknown');
  CREATE TYPE "public"."enum_message_templates_category" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');
  CREATE TYPE "public"."enum_message_templates_meta_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');
  CREATE TABLE "conversations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"channel" "enum_conversations_channel" DEFAULT 'whatsapp' NOT NULL,
  	"openbsp_id" varchar,
  	"organization_address" varchar,
  	"contact_address" varchar NOT NULL,
  	"client_id" integer,
  	"lead_id" integer,
  	"last_message_at" timestamp(3) with time zone,
  	"last_inbound_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"conversation_id" integer NOT NULL,
  	"direction" "enum_messages_direction" NOT NULL,
  	"openbsp_id" varchar,
  	"external_id" varchar,
  	"type" "enum_messages_type" DEFAULT 'text' NOT NULL,
  	"text" varchar,
  	"content" jsonb,
  	"status_json" jsonb,
  	"sender_address" varchar,
  	"performed_by_id" integer,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "message_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"language" varchar DEFAULT 'es' NOT NULL,
  	"category" "enum_message_templates_category",
  	"meta_status" "enum_message_templates_meta_status",
  	"body_text" varchar,
  	"components_json" jsonb,
  	"openbsp_template_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tenants" ADD COLUMN "openbsp_organization_id" varchar;
  ALTER TABLE "tenants" ADD COLUMN "openbsp_phone_number_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "conversations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "messages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "message_templates_id" integer;
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "conversations_tenant_idx" ON "conversations" USING btree ("tenant_id");
  CREATE INDEX "conversations_openbsp_id_idx" ON "conversations" USING btree ("openbsp_id");
  CREATE INDEX "conversations_client_idx" ON "conversations" USING btree ("client_id");
  CREATE INDEX "conversations_lead_idx" ON "conversations" USING btree ("lead_id");
  CREATE INDEX "conversations_updated_at_idx" ON "conversations" USING btree ("updated_at");
  CREATE INDEX "conversations_created_at_idx" ON "conversations" USING btree ("created_at");
  CREATE INDEX "messages_tenant_idx" ON "messages" USING btree ("tenant_id");
  CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");
  CREATE INDEX "messages_openbsp_id_idx" ON "messages" USING btree ("openbsp_id");
  CREATE INDEX "messages_external_id_idx" ON "messages" USING btree ("external_id");
  CREATE INDEX "messages_performed_by_idx" ON "messages" USING btree ("performed_by_id");
  CREATE INDEX "messages_updated_at_idx" ON "messages" USING btree ("updated_at");
  CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");
  CREATE INDEX "message_templates_tenant_idx" ON "message_templates" USING btree ("tenant_id");
  CREATE INDEX "message_templates_openbsp_template_id_idx" ON "message_templates" USING btree ("openbsp_template_id");
  CREATE INDEX "message_templates_updated_at_idx" ON "message_templates" USING btree ("updated_at");
  CREATE INDEX "message_templates_created_at_idx" ON "message_templates" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conversations_fk" FOREIGN KEY ("conversations_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_messages_fk" FOREIGN KEY ("messages_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_message_templates_fk" FOREIGN KEY ("message_templates_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_openbsp_organization_id_idx" ON "tenants" USING btree ("openbsp_organization_id");
  CREATE INDEX "payload_locked_documents_rels_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("conversations_id");
  CREATE INDEX "payload_locked_documents_rels_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("messages_id");
  CREATE INDEX "payload_locked_documents_rels_message_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("message_templates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "conversations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "message_templates" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "conversations" CASCADE;
  DROP TABLE "messages" CASCADE;
  DROP TABLE "message_templates" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_conversations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_messages_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_message_templates_fk";
  
  DROP INDEX "tenants_openbsp_organization_id_idx";
  DROP INDEX "payload_locked_documents_rels_conversations_id_idx";
  DROP INDEX "payload_locked_documents_rels_messages_id_idx";
  DROP INDEX "payload_locked_documents_rels_message_templates_id_idx";
  ALTER TABLE "tenants" DROP COLUMN "openbsp_organization_id";
  ALTER TABLE "tenants" DROP COLUMN "openbsp_phone_number_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "conversations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "messages_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "message_templates_id";
  DROP TYPE "public"."enum_conversations_channel";
  DROP TYPE "public"."enum_messages_direction";
  DROP TYPE "public"."enum_messages_type";
  DROP TYPE "public"."enum_message_templates_category";
  DROP TYPE "public"."enum_message_templates_meta_status";`)
}
