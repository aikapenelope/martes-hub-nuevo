import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * notifications.occurred_at — timestamp estructurado de la OCURRENCIA real del
 * incidente (p. ej. created_at del log de OpenBSP), distinto del createdAt de
 * la notificación (momento de importación). Permite al monitor de salud de 24h
 * no reportar incidentes viejos importados hoy como si fueran recientes.
 * Nullable: notificaciones anteriores caen a createdAt como fallback.
 * up() es idempotente (mismo patrón que el resto de migraciones del repo).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp(3) with time zone;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "notifications" DROP COLUMN IF EXISTS "occurred_at";
  `)
}
