import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * form_submissions.event_id — idempotencia del webhook de Tally: la reentrega
 * de un evento (eventId/responseId) se detecta por esta columna y se ignora.
 * El índice es UNIQUE para que la carrera entre entregas concurrentes del
 * mismo evento se resuelva en la base (la segunda cae con 23505 y el handler
 * responde como duplicado). Postgres permite múltiples NULL, así que los
 * envíos sin eventId no colisionan. up()/down() idempotentes (mismo patrón
 * que el resto de migraciones).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "form_submissions" ADD COLUMN IF NOT EXISTS "event_id" varchar;
  `)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "form_submissions_event_id_idx" ON "form_submissions" ("event_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "form_submissions_event_id_idx";
  `)
  await db.execute(sql`
    ALTER TABLE "form_submissions" DROP COLUMN IF EXISTS "event_id";
  `)
}
