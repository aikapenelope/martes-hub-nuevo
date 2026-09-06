import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * messages_idempotency_key — columna para el claim atómico de despacho de
 * respuestas (message-dispatch.ts). El claim es único por (conversación,
 * clave): dos peticiones concurrentes no pueden apropiarse la misma clave,
 * así los reintentos reconcilian en vez de duplicar el envío.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar;
  CREATE INDEX IF NOT EXISTS "messages_idempotency_key_idx" ON "messages" USING btree ("idempotency_key");
  CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_idempotency_uidx" ON "messages" ("conversation_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "messages_conversation_idempotency_uidx";
  DROP INDEX IF EXISTS "messages_idempotency_key_idx";
  ALTER TABLE "messages" DROP COLUMN IF EXISTS "idempotency_key";
  `)
}
