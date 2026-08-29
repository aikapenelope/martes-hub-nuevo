import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fix: `invoices`/`quotes` (plugin `payload-invoicepdf`) are declared as
 * tenant-scoped in `multiTenantPlugin`'s `collections` map and exposed to
 * the MCP agent as `find: true`, but the `20260825_074436_facturacion_cotizaciones`
 * migration never added the `tenant_id` column to their tables. Without this
 * column, any tenant-filtered query against `invoices`/`quotes` (including
 * the read-only MCP tool and the billing workspace views) either errors on
 * an unknown column or — worse — silently ignores the tenant filter.
 *
 * Backfill: if the deployment currently has exactly one tenant (the
 * documented mono-tenant bootstrap case — see the same fallback pattern in
 * `src/endpoints/openbspWebhook.ts` and `src/endpoints/tallyWebhook.ts`),
 * pre-existing rows are assigned to that tenant instead of being silently
 * orphaned once the column becomes tenant-filtered.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices" ADD COLUMN "tenant_id" integer;
  ALTER TABLE "quotes" ADD COLUMN "tenant_id" integer;

  UPDATE "invoices" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "id" ASC LIMIT 1)
    WHERE "tenant_id" IS NULL AND (SELECT COUNT(*) FROM "tenants") = 1;
  UPDATE "quotes" SET "tenant_id" = (SELECT "id" FROM "tenants" ORDER BY "id" ASC LIMIT 1)
    WHERE "tenant_id" IS NULL AND (SELECT COUNT(*) FROM "tenants") = 1;

  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id");
  CREATE INDEX "quotes_tenant_idx" ON "quotes" USING btree ("tenant_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "invoices" DROP CONSTRAINT "invoices_tenant_id_tenants_id_fk";
  ALTER TABLE "quotes" DROP CONSTRAINT "quotes_tenant_id_tenants_id_fk";
  DROP INDEX "invoices_tenant_idx";
  DROP INDEX "quotes_tenant_idx";
  ALTER TABLE "invoices" DROP COLUMN "tenant_id";
  ALTER TABLE "quotes" DROP COLUMN "tenant_id";`)
}
