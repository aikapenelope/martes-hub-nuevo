import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Identidad estable de los pasos de secuencia (hallazgos Devin #104 ronda 2):
// columnas (sequence_enrollment_id, sequence_step_index) en email_log y tasks,
// con índice único parcial WHERE source='sequence' — la dedupe del despacho ya
// no depende del asunto/título (pasos con contenido repetido dejaban de
// ejecutarse) y un envío confirmado cuyo avance se pierde no se reenvía.
// Además step_attempts en sequence_enrollments para el retry acotado de
// emails fallidos. Delta manual (todas las migraciones de este repo lo son).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "email_log" ADD COLUMN IF NOT EXISTS "sequence_enrollment_id" numeric;
    ALTER TABLE "email_log" ADD COLUMN IF NOT EXISTS "sequence_step_index" numeric;
    CREATE UNIQUE INDEX IF NOT EXISTS "email_log_sequence_step_identity_idx" ON "email_log" ("sequence_enrollment_id","sequence_step_index") WHERE ("source" = 'sequence');
    ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sequence_enrollment_id" numeric;
    ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sequence_step_index" numeric;
    CREATE UNIQUE INDEX IF NOT EXISTS "tasks_sequence_step_identity_idx" ON "tasks" ("sequence_enrollment_id","sequence_step_index") WHERE ("source" = 'sequence');
    ALTER TABLE "sequence_enrollments" ADD COLUMN IF NOT EXISTS "step_attempts" numeric DEFAULT 0;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "email_log_sequence_step_identity_idx";
    ALTER TABLE "email_log" DROP COLUMN IF EXISTS "sequence_step_index";
    ALTER TABLE "email_log" DROP COLUMN IF EXISTS "sequence_enrollment_id";
    DROP INDEX IF EXISTS "tasks_sequence_step_identity_idx";
    ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sequence_step_index";
    ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sequence_enrollment_id";
    ALTER TABLE "sequence_enrollments" DROP COLUMN IF EXISTS "step_attempts";
  `)
}
