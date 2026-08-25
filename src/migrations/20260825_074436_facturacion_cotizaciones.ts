import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_invoices_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled');
  CREATE TYPE "public"."enum_invoices_template" AS ENUM('Classic', 'Modern', 'Minimal', 'Bold');
  CREATE TYPE "public"."enum_quotes_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired');
  CREATE TYPE "public"."enum_quotes_template" AS ENUM('Classic', 'Modern', 'Minimal', 'Bold');
  CREATE TABLE "offers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"price" numeric NOT NULL,
  	"description" varchar,
  	"segment_id" integer,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "invoices_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"tax_rate" numeric DEFAULT 0.16,
  	"line_total" numeric
  );
  
  CREATE TABLE "invoices_send_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"to" varchar,
  	"template_used" varchar,
  	"subject" varchar,
  	"attached_pdf_id" integer,
  	"sent_by_id" integer
  );
  
  CREATE TABLE "invoices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"issue_date" timestamp(3) with time zone,
  	"due_date" timestamp(3) with time zone,
  	"client_customer_id" integer,
  	"client_name" varchar NOT NULL,
  	"client_email" varchar,
  	"client_address_street" varchar,
  	"client_address_city" varchar,
  	"client_address_postal_code" varchar,
  	"client_address_country" varchar,
  	"client_vat_number" varchar,
  	"notes" varchar,
  	"subtotal" numeric,
  	"tax_total" numeric,
  	"total" numeric,
  	"last_sent_at" timestamp(3) with time zone,
  	"invoice_number" varchar,
  	"status" "enum_invoices_status" DEFAULT 'draft',
  	"template" "enum_invoices_template" DEFAULT 'Classic',
  	"source_quote_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "invoices_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "quotes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"product_id" integer,
  	"description" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"tax_rate" numeric DEFAULT 0.16,
  	"line_total" numeric
  );
  
  CREATE TABLE "quotes_send_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"to" varchar,
  	"template_used" varchar,
  	"subject" varchar,
  	"attached_pdf_id" integer,
  	"sent_by_id" integer
  );
  
  CREATE TABLE "quotes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"issue_date" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"client_customer_id" integer,
  	"client_name" varchar NOT NULL,
  	"client_email" varchar,
  	"client_address_street" varchar,
  	"client_address_city" varchar,
  	"client_address_postal_code" varchar,
  	"client_address_country" varchar,
  	"client_vat_number" varchar,
  	"notes" varchar,
  	"subtotal" numeric,
  	"tax_total" numeric,
  	"total" numeric,
  	"accept_token" varchar,
  	"reject_token" varchar,
  	"token_expires_at" timestamp(3) with time zone,
  	"rejection_reason" varchar,
  	"last_sent_at" timestamp(3) with time zone,
  	"quote_number" varchar,
  	"status" "enum_quotes_status" DEFAULT 'draft',
  	"template" "enum_quotes_template" DEFAULT 'Classic',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "quotes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer,
  	"invoices_id" integer
  );
  
  CREATE TABLE "shop_info" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_name" varchar NOT NULL,
  	"company_logo_id" integer,
  	"address_street" varchar,
  	"address_city" varchar,
  	"address_postal_code" varchar,
  	"address_country" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"website" varchar,
  	"vat_number" varchar,
  	"siret" varchar,
  	"iban" varchar,
  	"bic" varchar,
  	"bank_name" varchar,
  	"legal_mentions" varchar,
  	"default_payment_terms" numeric DEFAULT 30,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "offers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "invoices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quotes_id" integer;
  ALTER TABLE "offers" ADD CONSTRAINT "offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offers" ADD CONSTRAINT "offers_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_items" ADD CONSTRAINT "invoices_items_product_id_offers_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_items" ADD CONSTRAINT "invoices_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "invoices_send_history" ADD CONSTRAINT "invoices_send_history_attached_pdf_id_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_send_history" ADD CONSTRAINT "invoices_send_history_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_send_history" ADD CONSTRAINT "invoices_send_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_customer_id_clients_id_fk" FOREIGN KEY ("client_customer_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_quote_id_quotes_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_rels" ADD CONSTRAINT "invoices_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "invoices_rels" ADD CONSTRAINT "invoices_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes_items" ADD CONSTRAINT "quotes_items_product_id_offers_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_items" ADD CONSTRAINT "quotes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes_send_history" ADD CONSTRAINT "quotes_send_history_attached_pdf_id_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_send_history" ADD CONSTRAINT "quotes_send_history_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_send_history" ADD CONSTRAINT "quotes_send_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_customer_id_clients_id_fk" FOREIGN KEY ("client_customer_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes_rels" ADD CONSTRAINT "quotes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes_rels" ADD CONSTRAINT "quotes_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "quotes_rels" ADD CONSTRAINT "quotes_rels_invoices_fk" FOREIGN KEY ("invoices_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shop_info" ADD CONSTRAINT "shop_info_company_logo_id_media_id_fk" FOREIGN KEY ("company_logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "offers_tenant_idx" ON "offers" USING btree ("tenant_id");
  CREATE INDEX "offers_segment_idx" ON "offers" USING btree ("segment_id");
  CREATE INDEX "offers_updated_at_idx" ON "offers" USING btree ("updated_at");
  CREATE INDEX "offers_created_at_idx" ON "offers" USING btree ("created_at");
  CREATE INDEX "invoices_items_order_idx" ON "invoices_items" USING btree ("_order");
  CREATE INDEX "invoices_items_parent_id_idx" ON "invoices_items" USING btree ("_parent_id");
  CREATE INDEX "invoices_items_product_idx" ON "invoices_items" USING btree ("product_id");
  CREATE INDEX "invoices_send_history_order_idx" ON "invoices_send_history" USING btree ("_order");
  CREATE INDEX "invoices_send_history_parent_id_idx" ON "invoices_send_history" USING btree ("_parent_id");
  CREATE INDEX "invoices_send_history_attached_pdf_idx" ON "invoices_send_history" USING btree ("attached_pdf_id");
  CREATE INDEX "invoices_send_history_sent_by_idx" ON "invoices_send_history" USING btree ("sent_by_id");
  CREATE INDEX "invoices_client_client_customer_idx" ON "invoices" USING btree ("client_customer_id");
  CREATE UNIQUE INDEX "invoices_invoice_number_idx" ON "invoices" USING btree ("invoice_number");
  CREATE INDEX "invoices_source_quote_idx" ON "invoices" USING btree ("source_quote_id");
  CREATE INDEX "invoices_updated_at_idx" ON "invoices" USING btree ("updated_at");
  CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");
  CREATE INDEX "invoices_rels_order_idx" ON "invoices_rels" USING btree ("order");
  CREATE INDEX "invoices_rels_parent_idx" ON "invoices_rels" USING btree ("parent_id");
  CREATE INDEX "invoices_rels_path_idx" ON "invoices_rels" USING btree ("path");
  CREATE INDEX "invoices_rels_media_id_idx" ON "invoices_rels" USING btree ("media_id");
  CREATE INDEX "quotes_items_order_idx" ON "quotes_items" USING btree ("_order");
  CREATE INDEX "quotes_items_parent_id_idx" ON "quotes_items" USING btree ("_parent_id");
  CREATE INDEX "quotes_items_product_idx" ON "quotes_items" USING btree ("product_id");
  CREATE INDEX "quotes_send_history_order_idx" ON "quotes_send_history" USING btree ("_order");
  CREATE INDEX "quotes_send_history_parent_id_idx" ON "quotes_send_history" USING btree ("_parent_id");
  CREATE INDEX "quotes_send_history_attached_pdf_idx" ON "quotes_send_history" USING btree ("attached_pdf_id");
  CREATE INDEX "quotes_send_history_sent_by_idx" ON "quotes_send_history" USING btree ("sent_by_id");
  CREATE INDEX "quotes_client_client_customer_idx" ON "quotes" USING btree ("client_customer_id");
  CREATE UNIQUE INDEX "quotes_quote_number_idx" ON "quotes" USING btree ("quote_number");
  CREATE INDEX "quotes_updated_at_idx" ON "quotes" USING btree ("updated_at");
  CREATE INDEX "quotes_created_at_idx" ON "quotes" USING btree ("created_at");
  CREATE INDEX "quotes_rels_order_idx" ON "quotes_rels" USING btree ("order");
  CREATE INDEX "quotes_rels_parent_idx" ON "quotes_rels" USING btree ("parent_id");
  CREATE INDEX "quotes_rels_path_idx" ON "quotes_rels" USING btree ("path");
  CREATE INDEX "quotes_rels_media_id_idx" ON "quotes_rels" USING btree ("media_id");
  CREATE INDEX "quotes_rels_invoices_id_idx" ON "quotes_rels" USING btree ("invoices_id");
  CREATE INDEX "shop_info_company_logo_idx" ON "shop_info" USING btree ("company_logo_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offers_fk" FOREIGN KEY ("offers_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invoices_fk" FOREIGN KEY ("invoices_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quotes_fk" FOREIGN KEY ("quotes_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_offers_id_idx" ON "payload_locked_documents_rels" USING btree ("offers_id");
  CREATE INDEX "payload_locked_documents_rels_invoices_id_idx" ON "payload_locked_documents_rels" USING btree ("invoices_id");
  CREATE INDEX "payload_locked_documents_rels_quotes_id_idx" ON "payload_locked_documents_rels" USING btree ("quotes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "offers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices_send_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes_send_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "quotes_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "shop_info" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "offers" CASCADE;
  DROP TABLE "invoices_items" CASCADE;
  DROP TABLE "invoices_send_history" CASCADE;
  DROP TABLE "invoices" CASCADE;
  DROP TABLE "invoices_rels" CASCADE;
  DROP TABLE "quotes_items" CASCADE;
  DROP TABLE "quotes_send_history" CASCADE;
  DROP TABLE "quotes" CASCADE;
  DROP TABLE "quotes_rels" CASCADE;
  DROP TABLE "shop_info" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_offers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_invoices_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_quotes_fk";
  
  DROP INDEX "payload_locked_documents_rels_offers_id_idx";
  DROP INDEX "payload_locked_documents_rels_invoices_id_idx";
  DROP INDEX "payload_locked_documents_rels_quotes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "offers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "invoices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quotes_id";
  DROP TYPE "public"."enum_invoices_status";
  DROP TYPE "public"."enum_invoices_template";
  DROP TYPE "public"."enum_quotes_status";
  DROP TYPE "public"."enum_quotes_template";`)
}
