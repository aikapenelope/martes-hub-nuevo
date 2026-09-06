import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Migración escrita a mano a partir del diff real de `payload migrate:create`
// (generado contra una BD con las migraciones previas aplicadas) y podada al
// delta nuevo: colección whiteboards + tablas de versiones (_notes_v,
// _social_posts_v[+_rels], _email_campaigns_v). Las tablas creadas por
// migraciones manuales previas (companies, appointments, email_messages,
// notes, ...) quedan fuera porque ya existen en las BD de producción.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum__email_campaigns_v_version_status" AS ENUM('draft', 'sending', 'sent', 'partial', 'failed');
   CREATE TYPE "public"."enum__notes_v_version_category" AS ENUM('general', 'cliente', 'reunion', 'seguimiento', 'idea', 'recordatorio');
   CREATE TYPE "public"."enum_whiteboards_source" AS ENUM('local', 'import');
   CREATE TYPE "public"."enum__social_posts_v_version_status" AS ENUM('borrador', 'programado', 'publicado', 'fallido');
   CREATE TABLE "_email_campaigns_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_name" varchar NOT NULL,
  	"version_subject" varchar NOT NULL,
  	"version_preheader" varchar,
  	"version_body_html" varchar NOT NULL,
  	"version_segment_id" integer,
  	"version_status" "enum__email_campaigns_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_scheduled_at" timestamp(3) with time zone,
  	"version_sent_at" timestamp(3) with time zone,
  	"version_sent_count" numeric DEFAULT 0,
  	"version_bounced_count" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
   CREATE TABLE "_notes_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_title" varchar NOT NULL,
  	"version_body" jsonb NOT NULL,
  	"version_category" "enum__notes_v_version_category" DEFAULT 'general',
  	"version_pinned" boolean DEFAULT false,
  	"version_client_id" integer,
  	"version_lead_id" integer,
  	"version_author_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
   CREATE TABLE "whiteboards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"scene" jsonb NOT NULL,
  	"thumbnail" varchar,
  	"source" "enum_whiteboards_source" DEFAULT 'local',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
   CREATE TABLE "_social_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_caption" varchar NOT NULL,
  	"version_account_id" integer NOT NULL,
  	"version_status" "enum__social_posts_v_version_status" DEFAULT 'borrador' NOT NULL,
  	"version_scheduled_at" timestamp(3) with time zone,
  	"version_published_at" timestamp(3) with time zone,
  	"version_platform_post_id" varchar,
  	"version_permalink" varchar,
  	"version_last_error" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
   CREATE TABLE "_social_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
   ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "whiteboards_id" integer;
   ALTER TABLE "_email_campaigns_v" ADD CONSTRAINT "_email_campaigns_v_parent_id_email_campaigns_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_campaigns"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_email_campaigns_v" ADD CONSTRAINT "_email_campaigns_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_email_campaigns_v" ADD CONSTRAINT "_email_campaigns_v_version_segment_id_segments_id_fk" FOREIGN KEY ("version_segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_parent_id_notes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_client_id_clients_id_fk" FOREIGN KEY ("version_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_lead_id_leads_id_fk" FOREIGN KEY ("version_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_notes_v" ADD CONSTRAINT "_notes_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_social_posts_v" ADD CONSTRAINT "_social_posts_v_parent_id_social_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."social_posts"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_social_posts_v" ADD CONSTRAINT "_social_posts_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_social_posts_v" ADD CONSTRAINT "_social_posts_v_version_account_id_social_accounts_id_fk" FOREIGN KEY ("version_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_social_posts_v_rels" ADD CONSTRAINT "_social_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_social_posts_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_social_posts_v_rels" ADD CONSTRAINT "_social_posts_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
   CREATE INDEX "_email_campaigns_v_parent_idx" ON "_email_campaigns_v" USING btree ("parent_id");
   CREATE INDEX "_email_campaigns_v_version_version_tenant_idx" ON "_email_campaigns_v" USING btree ("version_tenant_id");
   CREATE INDEX "_email_campaigns_v_version_version_segment_idx" ON "_email_campaigns_v" USING btree ("version_segment_id");
   CREATE INDEX "_email_campaigns_v_version_version_updated_at_idx" ON "_email_campaigns_v" USING btree ("version_updated_at");
   CREATE INDEX "_email_campaigns_v_version_version_created_at_idx" ON "_email_campaigns_v" USING btree ("version_created_at");
   CREATE INDEX "_email_campaigns_v_created_at_idx" ON "_email_campaigns_v" USING btree ("created_at");
   CREATE INDEX "_email_campaigns_v_updated_at_idx" ON "_email_campaigns_v" USING btree ("updated_at");
   CREATE INDEX "_notes_v_parent_idx" ON "_notes_v" USING btree ("parent_id");
   CREATE INDEX "_notes_v_version_version_tenant_idx" ON "_notes_v" USING btree ("version_tenant_id");
   CREATE INDEX "_notes_v_version_version_client_idx" ON "_notes_v" USING btree ("version_client_id");
   CREATE INDEX "_notes_v_version_version_lead_idx" ON "_notes_v" USING btree ("version_lead_id");
   CREATE INDEX "_notes_v_version_version_author_idx" ON "_notes_v" USING btree ("version_author_id");
   CREATE INDEX "_notes_v_version_version_updated_at_idx" ON "_notes_v" USING btree ("version_updated_at");
   CREATE INDEX "_notes_v_version_version_created_at_idx" ON "_notes_v" USING btree ("version_created_at");
   CREATE INDEX "_notes_v_created_at_idx" ON "_notes_v" USING btree ("created_at");
   CREATE INDEX "_notes_v_updated_at_idx" ON "_notes_v" USING btree ("updated_at");
   CREATE INDEX "whiteboards_tenant_idx" ON "whiteboards" USING btree ("tenant_id");
   CREATE INDEX "whiteboards_updated_at_idx" ON "whiteboards" USING btree ("updated_at");
   CREATE INDEX "whiteboards_created_at_idx" ON "whiteboards" USING btree ("created_at");
   CREATE INDEX "_social_posts_v_parent_idx" ON "_social_posts_v" USING btree ("parent_id");
   CREATE INDEX "_social_posts_v_version_version_tenant_idx" ON "_social_posts_v" USING btree ("version_tenant_id");
   CREATE INDEX "_social_posts_v_version_version_account_idx" ON "_social_posts_v" USING btree ("version_account_id");
   CREATE INDEX "_social_posts_v_version_version_updated_at_idx" ON "_social_posts_v" USING btree ("version_updated_at");
   CREATE INDEX "_social_posts_v_version_version_created_at_idx" ON "_social_posts_v" USING btree ("version_created_at");
   CREATE INDEX "_social_posts_v_created_at_idx" ON "_social_posts_v" USING btree ("created_at");
   CREATE INDEX "_social_posts_v_updated_at_idx" ON "_social_posts_v" USING btree ("updated_at");
   CREATE INDEX "_social_posts_v_rels_order_idx" ON "_social_posts_v_rels" USING btree ("order");
   CREATE INDEX "_social_posts_v_rels_parent_idx" ON "_social_posts_v_rels" USING btree ("parent_id");
   CREATE INDEX "_social_posts_v_rels_path_idx" ON "_social_posts_v_rels" USING btree ("path");
   CREATE INDEX "_social_posts_v_rels_media_id_idx" ON "_social_posts_v_rels" USING btree ("media_id");
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_whiteboards_fk" FOREIGN KEY ("whiteboards_id") REFERENCES "public"."whiteboards"("id") ON DELETE cascade ON UPDATE no action;
   CREATE INDEX "payload_locked_documents_rels_whiteboards_id_idx" ON "payload_locked_documents_rels" USING btree ("whiteboards_id");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_email_campaigns_v" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE "_notes_v" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE "whiteboards" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE "_social_posts_v" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE "_social_posts_v_rels" DISABLE ROW LEVEL SECURITY;
   DROP TABLE "_email_campaigns_v" CASCADE;
   DROP TABLE "_notes_v" CASCADE;
   DROP TABLE "whiteboards" CASCADE;
   DROP TABLE "_social_posts_v" CASCADE;
   DROP TABLE "_social_posts_v_rels" CASCADE;
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_whiteboards_fk";
   DROP INDEX "payload_locked_documents_rels_whiteboards_id_idx";
   ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "whiteboards_id";
   DROP TYPE "public"."enum__email_campaigns_v_version_status";
   DROP TYPE "public"."enum__notes_v_version_category";
   DROP TYPE "public"."enum_whiteboards_source";
   DROP TYPE "public"."enum__social_posts_v_version_status";
  `)
}
