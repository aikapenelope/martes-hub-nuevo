import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Evento de conversión medible: instante en que el lead se convirtió en
// cliente (se escribe en la acción de conversión). Habilita deltas de
// conversión por ventana real sin contaminación de cohortes. Columna
// nullable: las conversiones históricas quedan sin instante y simplemente
// no cuentan en las ventanas de deltas.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "converted_at" timestamp with time zone;
    CREATE INDEX IF NOT EXISTS "leads_converted_at_idx" ON "leads" ("converted_at");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "leads_converted_at_idx";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "converted_at";
  `)
}
