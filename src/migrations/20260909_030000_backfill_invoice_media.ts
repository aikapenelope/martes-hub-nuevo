import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Backfill del issue #110 / hallazgos Devin PR #113:
//
// 1. Los PDFs históricos de facturación (generados cuando la colección del
//    plugin era `media`) viven en filas de media referenciadas por
//    quotes_rels/invoices_rels.media_id. Con la relación apuntando a
//    invoice-media, Payload lee invoice_media_id y esos PDFs desaparecieron
//    de sus documentos. Se copian las filas de media a invoice_media (el
//    objeto físico en R2/disco NO se mueve: filename/url se conservan, que es
//    la identidad real del archivo en storage) y se mapea cada referencia por
//    filename — NO por id: los ids de media chocarían con filas ya existentes
//    en invoice_media (deployments de preview ya aplicaron la migración
//    base). La columna temporal _backfill_media_id lleva el mapeo y se
//    elimina al final. La secuencia se resetea tras los inserts (un insert
//    con secuencia atrás haría fallar el próximo create del plugin con
//    "Value must be unique: id"). Las filas de media originales se conservan:
//    borrarlas dispararía el cleanup de storage y destruiría los archivos.
// 2. attachedPdf del send-history del plugin cambió su relationTo a
//    invoice-media: las FKs de attached_pdf_id apuntaban a media y la primera
//    fila de envío violaría la FK. Se repunta la FK (0 filas hoy: no hay
//    backfill de send-history).
// 3. tenant_id NOT NULL en invoice_media: a nivel BD, ningún PDF puede
//    quedar sin tenant (defensa en profundidad contra el leak del último
//    fallback). Los históricos ya traen tenant (verificado en producción).
//
// Delta manual (convención del repo). Idempotente: dedupe por filename y
// guardas WHERE ... IS NULL.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- 1a. Columna temporal de mapeo media→invoice_media
    ALTER TABLE "invoice_media" ADD COLUMN IF NOT EXISTS "_backfill_media_id" integer;
    CREATE INDEX IF NOT EXISTS "invoice_media_backfill_media_id_idx" ON "invoice_media" ("_backfill_media_id");

    -- 1b. Copiar los PDFs de facturación históricos (nuevos ids de serial;
    -- dedupe por filename: la identidad real del objeto en storage)
    INSERT INTO "invoice_media" ("alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "tenant_id", "_backfill_media_id")
    SELECT COALESCE(m."alt", m."filename"), m."updated_at", m."created_at", m."url", m."thumbnail_u_r_l", m."filename", m."mime_type", m."filesize", m."width", m."height", m."focal_x", m."focal_y", m."tenant_id", m."id"
    FROM "media" m
    WHERE m."mime_type" = 'application/pdf'
      AND m."filename" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "invoice_media" im WHERE im."filename" = m."filename");

    -- 1c. Mapear las referencias generadas por la copia nueva…
    UPDATE "quotes_rels" r
    SET "invoice_media_id" = im."id"
    FROM "media" m, "invoice_media" im
    WHERE r."media_id" = m."id" AND r."invoice_media_id" IS NULL AND im."_backfill_media_id" = m."id";
    UPDATE "invoices_rels" r
    SET "invoice_media_id" = im."id"
    FROM "media" m, "invoice_media" im
    WHERE r."media_id" = m."id" AND r."invoice_media_id" IS NULL AND im."_backfill_media_id" = m."id";

    -- …y las que ya existían en invoice_media de deployments previos
    -- (mismo filename, sin columna de mapeo).
    UPDATE "quotes_rels" r
    SET "invoice_media_id" = im."id"
    FROM "media" m, "invoice_media" im
    WHERE r."media_id" = m."id" AND r."invoice_media_id" IS NULL AND im."filename" = m."filename";
    UPDATE "invoices_rels" r
    SET "invoice_media_id" = im."id"
    FROM "media" m, "invoice_media" im
    WHERE r."media_id" = m."id" AND r."invoice_media_id" IS NULL AND im."filename" = m."filename";

    -- 1d. Resetear la secuencia (los inserts manuales la dejan atrás)
    SELECT setval(
      pg_get_serial_sequence('"invoice_media"', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 0) FROM "invoice_media"), 1)
    );

    -- 1e. Limpieza del mapeo temporal
    DROP INDEX IF EXISTS "invoice_media_backfill_media_id_idx";
    ALTER TABLE "invoice_media" DROP COLUMN IF EXISTS "_backfill_media_id";

    -- 2. Send-history del plugin: repuntar la FK de attached_pdf_id a
    -- invoice_media (relationTo nuevo). Sin backfill: no hay envíos
    -- históricos (0 filas en producción).
    ALTER TABLE "quotes_send_history" DROP CONSTRAINT IF EXISTS "quotes_send_history_attached_pdf_id_media_id_fk";
    ALTER TABLE "quotes_send_history" ADD CONSTRAINT "quotes_send_history_attached_pdf_id_invoice_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."invoice_media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "invoices_send_history" DROP CONSTRAINT IF EXISTS "invoices_send_history_attached_pdf_id_media_id_fk";
    ALTER TABLE "invoices_send_history" ADD CONSTRAINT "invoices_send_history_attached_pdf_id_invoice_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."invoice_media"("id") ON DELETE set null ON UPDATE no action;

    -- 3. Defensa en profundidad contra PDFs sin tenant (leak entre tenants).
    ALTER TABLE "invoice_media" ALTER COLUMN "tenant_id" SET NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "invoice_media" ALTER COLUMN "tenant_id" DROP NOT NULL;
    ALTER TABLE "quotes_send_history" DROP CONSTRAINT IF EXISTS "quotes_send_history_attached_pdf_id_invoice_media_id_fk";
    ALTER TABLE "quotes_send_history" ADD CONSTRAINT "quotes_send_history_attached_pdf_id_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "invoices_send_history" DROP CONSTRAINT IF EXISTS "invoices_send_history_attached_pdf_id_invoice_media_id_fk";
    ALTER TABLE "invoices_send_history" ADD CONSTRAINT "invoices_send_history_attached_pdf_id_media_id_fk" FOREIGN KEY ("attached_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    UPDATE "quotes_rels" SET "invoice_media_id" = NULL WHERE "invoice_media_id" IS NOT NULL;
    UPDATE "invoices_rels" SET "invoice_media_id" = NULL WHERE "invoice_media_id" IS NOT NULL;
  `)
}
