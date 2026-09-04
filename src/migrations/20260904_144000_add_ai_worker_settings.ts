import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Agrega configuración de IA para el worker ligero (Groq / OpenRouter) en company_settings:
 * - ai_provider: 'groq' | 'openrouter' | 'custom'
 * - ai_api_key: varchar
 * - ai_model: varchar (default: 'llama-3.3-70b-versatile')
 * - ai_auto_summarize: boolean (default: true)
 *
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_company_settings_ai_provider" AS ENUM('groq', 'openrouter', 'custom');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "ai_provider" "public"."enum_company_settings_ai_provider" DEFAULT 'groq';
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "ai_api_key" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "ai_model" varchar DEFAULT 'llama-3.3-70b-versatile';
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "ai_auto_summarize" boolean DEFAULT true;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "ai_auto_summarize";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "ai_model";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "ai_api_key";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "ai_provider";
    DROP TYPE IF EXISTS "public"."enum_company_settings_ai_provider";
  `)
}
