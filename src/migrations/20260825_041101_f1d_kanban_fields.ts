import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_leads_kanban_status" AS ENUM('nuevo', 'contactado', 'calificado', 'descartado');
  ALTER TABLE "leads" ADD COLUMN "kanban_status" "enum_leads_kanban_status" DEFAULT 'nuevo';
  ALTER TABLE "leads" ADD COLUMN "kanban_order_rank" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "leads" DROP COLUMN "kanban_status";
  ALTER TABLE "leads" DROP COLUMN "kanban_order_rank";
  DROP TYPE "public"."enum_leads_kanban_status";`)
}
