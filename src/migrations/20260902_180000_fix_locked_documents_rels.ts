import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Corrección de columnas de relaciones de documentos bloqueados (payload_locked_documents_rels):
 *
 * Asegura que las colecciones `companies`, `email_messages` y `appointments`
 * tengan sus columnas de clave foránea e índices creados en la tabla
 * `payload_locked_documents_rels`. Sin estas columnas, cualquier operación
 * que active el bloqueo de documentos (como crear, editar o eliminar tareas,
 * leads o clientes) falla con el error:
 * "column payload_locked_documents_rels.companies_id does not exist".
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "companies_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_companies_fk" FOREIGN KEY ("companies_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("companies_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "email_messages_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_email_messages_fk" FOREIGN KEY ("email_messages_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_email_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("email_messages_id");

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "appointments_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_appointments_fk" FOREIGN KEY ("appointments_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_appointments_id_idx" ON "payload_locked_documents_rels" USING btree ("appointments_id");
  `)
}

/**
 * Al hacer rollback de esta migración de reparación, se preservan las columnas
 * companies_id, email_messages_id y appointments_id porque fueron definidas por
 * las migraciones previas 20260901_120000_companies_and_email_log_links,
 * 20260901_130000_email_messages_mirror y 20260901_140000_appointments_gcal_mirror,
 * las cuales siguen aplicadas y requieren estas columnas para el document locking.
 * Cada una de esas migraciones es dueña del ciclo de vida de su respectiva columna
 * cuando se realiza su propio rollback.
 */
export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op intencional: preservar el esquema esperado por las migraciones previas aún aplicadas.
}
