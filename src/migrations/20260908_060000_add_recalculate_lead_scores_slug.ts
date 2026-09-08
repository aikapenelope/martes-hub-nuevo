import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task nueva de scoring: recalculate-lead-scores. Los slugs de tasks viven en
// enums de Postgres (payload_jobs.task_slug y payload_jobs_logs.task_slug) —
// sin este ALTER TYPE el primer handleSchedules/queue en producción falla con
// "invalid input value for enum" (mismo caso que generate-lead-brief).
// El down no revierte el ADD VALUE: quitar valores de un enum no es posible
// de forma limpia y el slug es aditivo (patrón de add_lead_briefs).

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'recalculate-lead-scores';
    ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'recalculate-lead-scores';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Sin reversa: el slug permanece (inofensivo) — ver comentario arriba.
  await db.execute(sql`SELECT 1`)
}
