import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Agrega a `leads` los campos que necesita el Pipeline de Ventas
 * Conversacional 360° del workspace: `estimatedValue` (valor de la
 * oportunidad) y `assignedTo` (agente responsable, mismo patrón que
 * `clients.assignedAgent` — ver `20260825_021413_f1_core_collections`).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "leads" ADD COLUMN "estimated_value" numeric;
  ALTER TABLE "leads" ADD COLUMN "assigned_to_id" integer;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "leads_assigned_to_idx" ON "leads" USING btree ("assigned_to_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "leads" DROP CONSTRAINT "leads_assigned_to_id_users_id_fk";
  DROP INDEX "leads_assigned_to_idx";
  ALTER TABLE "leads" DROP COLUMN "estimated_value";
  ALTER TABLE "leads" DROP COLUMN "assigned_to_id";`)
}
