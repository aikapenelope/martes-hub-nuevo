import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Sincroniza el esquema de Neon con el enriquecimiento de Leads/Clients del
 * PR #42 (feat(crm): enrich lead/client schemas) — cuya migración nunca se
 * generó. Síntoma en producción: `column "company_name" does not exist` en
 * cualquier query de leads/clients → cockpit y CRM devolvían 500.
 *
 * Por qué manual y no `migrate:create`: el diff automático de drizzle arrastra
 * drift histórico del import-export plugin (re-crearía `exports`/`imports`,
 * fallando con `type "enum_exports_format" already exists`) y eliminaría los
 * índices de performance de 050000 creados con SQL raw. Esta migración es
 * quirúrgica y up() es idempotente (mismo patrón que el resto del repo).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Tipos de enum para "último canal de contacto" (leads + clients)
    DO $$ BEGIN
      CREATE TYPE "public"."enum_leads_last_contact_channel" AS ENUM('whatsapp', 'instagram_dm', 'llamada', 'en_persona', 'email', 'otro');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_clients_last_contact_channel" AS ENUM('whatsapp', 'instagram_dm', 'llamada', 'en_persona', 'email', 'otro');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Nuevos orígenes de captación añadidos en el PR #42
    ALTER TYPE "public"."enum_leads_source" ADD VALUE IF NOT EXISTS 'google_maps';
    ALTER TYPE "public"."enum_leads_source" ADD VALUE IF NOT EXISTS 'puerta_fria';
    ALTER TYPE "public"."enum_leads_source" ADD VALUE IF NOT EXISTS 'linkedin';

    -- Enriquecimiento de leads
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_name" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "position" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "city" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "state" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "address" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "google_maps_url" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "social_handle" varchar;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_contact_channel" "public"."enum_leads_last_contact_channel";
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp(3) with time zone;
    ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "commercial_notes" varchar;

    -- Enriquecimiento de clients
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "company_name" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tax_id" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "city" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "state" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "address" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_maps_url" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "social_handle" varchar;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "last_contact_channel" "public"."enum_clients_last_contact_channel";
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp(3) with time zone;
    ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "commercial_notes" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "company_name";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "position";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "city";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "state";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "address";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "google_maps_url";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "social_handle";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "last_contact_channel";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "last_contacted_at";
    ALTER TABLE "leads" DROP COLUMN IF EXISTS "commercial_notes";

    ALTER TABLE "clients" DROP COLUMN IF EXISTS "company_name";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "tax_id";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "city";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "state";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "address";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "google_maps_url";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "social_handle";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "last_contact_channel";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "last_contacted_at";
    ALTER TABLE "clients" DROP COLUMN IF EXISTS "commercial_notes";
  `)
}
