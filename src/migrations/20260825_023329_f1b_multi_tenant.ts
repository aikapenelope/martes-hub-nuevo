import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tenants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_tenants" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tenant_id" integer NOT NULL
  );
  
  ALTER TABLE "company_settings" ALTER COLUMN "updated_at" SET DEFAULT now();
  ALTER TABLE "company_settings" ALTER COLUMN "updated_at" SET NOT NULL;
  ALTER TABLE "company_settings" ALTER COLUMN "created_at" SET DEFAULT now();
  ALTER TABLE "company_settings" ALTER COLUMN "created_at" SET NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "leads" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "activities" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "segments" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "documents" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "media" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tenants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "company_settings_id" integer;
  ALTER TABLE "company_settings" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "users_tenants_order_idx" ON "users_tenants" USING btree ("_order");
  CREATE INDEX "users_tenants_parent_id_idx" ON "users_tenants" USING btree ("_parent_id");
  CREATE INDEX "users_tenants_tenant_idx" ON "users_tenants" USING btree ("tenant_id");
  ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "segments" ADD CONSTRAINT "segments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_company_settings_fk" FOREIGN KEY ("company_settings_id") REFERENCES "public"."company_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "clients_tenant_idx" ON "clients" USING btree ("tenant_id");
  CREATE INDEX "leads_tenant_idx" ON "leads" USING btree ("tenant_id");
  CREATE INDEX "activities_tenant_idx" ON "activities" USING btree ("tenant_id");
  CREATE INDEX "segments_tenant_idx" ON "segments" USING btree ("tenant_id");
  CREATE INDEX "documents_tenant_idx" ON "documents" USING btree ("tenant_id");
  CREATE INDEX "media_tenant_idx" ON "media" USING btree ("tenant_id");
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_company_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("company_settings_id");
  CREATE UNIQUE INDEX "company_settings_tenant_idx" ON "company_settings" USING btree ("tenant_id");
  CREATE INDEX "company_settings_updated_at_idx" ON "company_settings" USING btree ("updated_at");
  CREATE INDEX "company_settings_created_at_idx" ON "company_settings" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users_tenants" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "users_tenants" CASCADE;
  ALTER TABLE "clients" DROP CONSTRAINT "clients_tenant_id_tenants_id_fk";
  
  ALTER TABLE "leads" DROP CONSTRAINT "leads_tenant_id_tenants_id_fk";
  
  ALTER TABLE "activities" DROP CONSTRAINT "activities_tenant_id_tenants_id_fk";
  
  ALTER TABLE "segments" DROP CONSTRAINT "segments_tenant_id_tenants_id_fk";
  
  ALTER TABLE "documents" DROP CONSTRAINT "documents_tenant_id_tenants_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_tenant_id_tenants_id_fk";
  
  ALTER TABLE "company_settings" DROP CONSTRAINT "company_settings_tenant_id_tenants_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tenants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_company_settings_fk";
  
  DROP INDEX "clients_tenant_idx";
  DROP INDEX "leads_tenant_idx";
  DROP INDEX "activities_tenant_idx";
  DROP INDEX "segments_tenant_idx";
  DROP INDEX "documents_tenant_idx";
  DROP INDEX "media_tenant_idx";
  DROP INDEX "company_settings_tenant_idx";
  DROP INDEX "company_settings_updated_at_idx";
  DROP INDEX "company_settings_created_at_idx";
  DROP INDEX "payload_locked_documents_rels_tenants_id_idx";
  DROP INDEX "payload_locked_documents_rels_company_settings_id_idx";
  ALTER TABLE "company_settings" ALTER COLUMN "updated_at" DROP DEFAULT;
  ALTER TABLE "company_settings" ALTER COLUMN "updated_at" DROP NOT NULL;
  ALTER TABLE "company_settings" ALTER COLUMN "created_at" DROP DEFAULT;
  ALTER TABLE "company_settings" ALTER COLUMN "created_at" DROP NOT NULL;
  ALTER TABLE "clients" DROP COLUMN "tenant_id";
  ALTER TABLE "leads" DROP COLUMN "tenant_id";
  ALTER TABLE "activities" DROP COLUMN "tenant_id";
  ALTER TABLE "segments" DROP COLUMN "tenant_id";
  ALTER TABLE "documents" DROP COLUMN "tenant_id";
  ALTER TABLE "media" DROP COLUMN "tenant_id";
  ALTER TABLE "company_settings" DROP COLUMN "tenant_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tenants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "company_settings_id";`)
}
