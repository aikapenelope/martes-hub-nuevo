import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Valor nuevo del enum tasks.source para recordatorios automáticos de lead
// interesado. Migración separada de add_lead_briefs porque Postgres no
// permite USAR un valor de enum recién agregado (el predicado del índice
// parcial de esa migración) dentro de la misma transacción que lo agrega.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_tasks_source" ADD VALUE IF NOT EXISTS 'lead_hot';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Los enums no se pueden borrar valores; el valor queda sin uso.
  await db.execute(sql`SELECT 1`)
}
