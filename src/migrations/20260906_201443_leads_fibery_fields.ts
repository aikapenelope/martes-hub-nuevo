import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Campos de cualificación/llamadas del CRM (modelo Fibery): select nuevos
// (enums nativos), checkboxes, textos, fecha y el nuevo valor de `source`
// llamada_fria (ALTER TYPE). Los join fields (touchpoints/tareas/notas) no
// llevan columnas: son relaciones inversas leídas desde activities/tasks/notes.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_leads_source" ADD VALUE IF NOT EXISTS 'llamada_fria';
    CREATE TYPE "public"."enum_leads_nivel_interes" AS ENUM('frio', 'templado', 'caliente');
    CREATE TYPE "public"."enum_leads_prioridad" AS ENUM('baja', 'media', 'alta');
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "nivel_interes" "enum_leads_nivel_interes";
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "prioridad" "enum_leads_prioridad";
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "whatsapp_link" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "numero_de_llamadas" double precision DEFAULT 0;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "visitado_presencialmente" boolean DEFAULT false;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pudo_hablar_decisor" boolean DEFAULT false;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "persona_interes" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "identificador" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "servicio_interes" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "website" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sector_fibery" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "fecha_proxima_llamada" timestamp(3) with time zone;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notas_llamada" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "notas_llamada";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "fecha_proxima_llamada";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "sector_fibery";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "servicio_interes";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "identificador";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "persona_interes";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "pudo_hablar_decisor";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "visitado_presencialmente";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "numero_de_llamadas";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "whatsapp_link";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "prioridad";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "nivel_interes";
    DROP TYPE IF EXISTS "public"."enum_leads_prioridad";
    DROP TYPE IF EXISTS "public"."enum_leads_nivel_interes";
  `)
}
