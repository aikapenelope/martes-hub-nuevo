import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// El grupo paymentMethods completo se añadió a CompanySettings.ts (PR #82)
// sin migración: las columnas no existían y TODO select de company-settings
// fallaba — la página de Facturación (y cualquier lector de settings)
// devolvía 500. IF NOT EXISTS para que sea segura también sobre BDs con drift.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_pago_movil_banco" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_pago_movil_cedula" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_pago_movil_telefono" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_transferencia_ves_banco" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_transferencia_ves_numero_cuenta" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_transferencia_ves_titular" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_transferencia_ves_rif" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_zelle_email" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_zelle_titular" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_binance_binance_id" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_binance_wallet_usdt" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_swift_banco" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_swift_swift" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_swift_account_number" varchar;
    ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "payment_methods_swift_titular" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_pago_movil_banco";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_pago_movil_cedula";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_pago_movil_telefono";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_transferencia_ves_banco";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_transferencia_ves_numero_cuenta";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_transferencia_ves_titular";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_transferencia_ves_rif";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_zelle_email";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_zelle_titular";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_binance_binance_id";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_binance_wallet_usdt";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_swift_banco";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_swift_swift";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_swift_account_number";
    ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "payment_methods_swift_titular";
  `)
}
