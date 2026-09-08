import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Colección invoice-media (issue #110): storage dedicado de los PDFs que
// payload-invoicepdf genera para facturas y cotizaciones. Sin allowlist de
// mimeTypes — checkFileRestrictions (file-type) rechaza los Buffer del Local
// API que el plugin sube. Delta manual (convención del repo).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "invoice_media" (
      "id" serial PRIMARY KEY NOT NULL,
      "alt" varchar NOT NULL,
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
      "focal_y" numeric,
      "tenant_id" integer
    );
    ALTER TABLE "invoice_media" ADD CONSTRAINT "invoice_media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "invoice_media_tenant_idx" ON "invoice_media" USING btree ("tenant_id");
    CREATE INDEX "invoice_media_updated_at_idx" ON "invoice_media" USING btree ("updated_at");
    CREATE INDEX "invoice_media_created_at_idx" ON "invoice_media" USING btree ("created_at");
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "invoice_media_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invoice_media_fk" FOREIGN KEY ("invoice_media_id") REFERENCES "public"."invoice_media"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_invoice_media_id_idx" ON "payload_locked_documents_rels" ("invoice_media_id");
    -- generatedPdfs (hasMany del plugin) ahora apunta a invoice-media:
    -- Payload espera estas columnas en las tablas de relaciones.
    ALTER TABLE "quotes_rels" ADD COLUMN IF NOT EXISTS "invoice_media_id" integer;
    ALTER TABLE "invoices_rels" ADD COLUMN IF NOT EXISTS "invoice_media_id" integer;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_invoice_media_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_invoice_media_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "invoice_media_id";
    DROP TABLE IF EXISTS "invoice_media";
  `)
}
