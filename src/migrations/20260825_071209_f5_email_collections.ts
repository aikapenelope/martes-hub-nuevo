import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_log_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed');
  CREATE TYPE "public"."enum_email_log_source" AS ENUM('transactional', 'campaign', 'test');
  CREATE TYPE "public"."enum_email_campaigns_status" AS ENUM('draft', 'sending', 'sent', 'partial', 'failed');
  CREATE TABLE "email_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"to" varchar NOT NULL,
  	"from" varchar,
  	"subject" varchar NOT NULL,
  	"status" "enum_email_log_status" DEFAULT 'queued' NOT NULL,
  	"source" "enum_email_log_source" DEFAULT 'transactional' NOT NULL,
  	"provider_message_id" varchar,
  	"campaign_id" integer,
  	"error" varchar,
  	"events_json" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_campaigns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"subject" varchar NOT NULL,
  	"preheader" varchar,
  	"body_html" varchar NOT NULL,
  	"segment_id" integer,
  	"status" "enum_email_campaigns_status" DEFAULT 'draft' NOT NULL,
  	"scheduled_at" timestamp(3) with time zone,
  	"sent_at" timestamp(3) with time zone,
  	"sent_count" numeric DEFAULT 0,
  	"bounced_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_log_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "email_campaigns_id" integer;
  ALTER TABLE "email_log" ADD CONSTRAINT "email_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_log" ADD CONSTRAINT "email_log_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "email_log_tenant_idx" ON "email_log" USING btree ("tenant_id");
  CREATE INDEX "email_log_provider_message_id_idx" ON "email_log" USING btree ("provider_message_id");
  CREATE INDEX "email_log_campaign_idx" ON "email_log" USING btree ("campaign_id");
  CREATE INDEX "email_log_updated_at_idx" ON "email_log" USING btree ("updated_at");
  CREATE INDEX "email_log_created_at_idx" ON "email_log" USING btree ("created_at");
  CREATE INDEX "email_campaigns_tenant_idx" ON "email_campaigns" USING btree ("tenant_id");
  CREATE INDEX "email_campaigns_segment_idx" ON "email_campaigns" USING btree ("segment_id");
  CREATE INDEX "email_campaigns_updated_at_idx" ON "email_campaigns" USING btree ("updated_at");
  CREATE INDEX "email_campaigns_created_at_idx" ON "email_campaigns" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_log_fk" FOREIGN KEY ("email_log_id") REFERENCES "public"."email_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_campaigns_fk" FOREIGN KEY ("email_campaigns_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_email_log_id_idx" ON "payload_locked_documents_rels" USING btree ("email_log_id");
  CREATE INDEX "payload_locked_documents_rels_email_campaigns_id_idx" ON "payload_locked_documents_rels" USING btree ("email_campaigns_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "email_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_campaigns" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "email_log" CASCADE;
  DROP TABLE "email_campaigns" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_log_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_email_campaigns_fk";
  
  DROP INDEX "payload_locked_documents_rels_email_log_id_idx";
  DROP INDEX "payload_locked_documents_rels_email_campaigns_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_log_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "email_campaigns_id";
  DROP TYPE "public"."enum_email_log_status";
  DROP TYPE "public"."enum_email_log_source";
  DROP TYPE "public"."enum_email_campaigns_status";`)
}
