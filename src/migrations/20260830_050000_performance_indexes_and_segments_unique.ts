import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Índices de rendimiento compuestos + fix del único global de segments.
 *
 * Contrastado contra un audit externo (4 PRs abiertos en el mirror de
 * GitHub, basados en un commit muy anterior) que proponía además activar
 * Row Level Security (RLS) con políticas para `service_role` — eso es
 * específico de Supabase/PostgREST y no existe en Neon (el rol de la
 * conexión de Payload aquí no es `service_role`); aplicado tal cual
 * habría dejado CADA tabla sin ninguna política para el rol real, lo que
 * en Postgres significa denegar todo acceso a todas las filas — hubiera
 * roto la aplicación completa. Se descarta esa parte del audit por
 * completo; solo se toman los índices, que son independientes de RLS.
 *
 * up() es idempotente (mismo patrón que el resto de migraciones de este
 * repo): CREATE INDEX IF NOT EXISTS.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Payments: dashboard/billing filtran por tenant+estado y tenant+vencimiento
    CREATE INDEX IF NOT EXISTS "payments_tenant_status_idx" ON "payments" USING btree ("tenant_id", "status");
    CREATE INDEX IF NOT EXISTS "payments_tenant_due_date_idx" ON "payments" USING btree ("tenant_id", "due_date");

    -- Tasks: tablero/agenda filtran por tenant+estado y tenant+vencimiento
    CREATE INDEX IF NOT EXISTS "tasks_tenant_status_idx" ON "tasks" USING btree ("tenant_id", "status");
    CREATE INDEX IF NOT EXISTS "tasks_tenant_due_date_idx" ON "tasks" USING btree ("tenant_id", "due_date");

    -- Leads/Clients: CRM filtra por tenant+estado/etapa constantemente
    CREATE INDEX IF NOT EXISTS "leads_tenant_status_idx" ON "leads" USING btree ("tenant_id", "status");
    CREATE INDEX IF NOT EXISTS "clients_tenant_stage_idx" ON "clients" USING btree ("tenant_id", "stage");

    -- Conversations/Messages: inbox ordena por tenant+última actividad
    CREATE INDEX IF NOT EXISTS "conversations_tenant_last_message_idx" ON "conversations" USING btree ("tenant_id", "last_message_at");
    CREATE INDEX IF NOT EXISTS "messages_tenant_conversation_sent_idx" ON "messages" USING btree ("tenant_id", "conversation_id", "sent_at");

    -- Email log: campañas filtran por campaign_id+status para sentCount/bouncedCount
    CREATE INDEX IF NOT EXISTS "email_log_campaign_status_idx" ON "email_log" USING btree ("campaign_id", "status");

    -- Notifications: la campana filtra por tenant+no-leídas constantemente
    CREATE INDEX IF NOT EXISTS "notifications_tenant_read_idx" ON "notifications" USING btree ("tenant_id", "read");

    -- Social: Social Hub filtra por tenant+estado; métricas ordenan por tenant+fecha de medición
    CREATE INDEX IF NOT EXISTS "social_posts_tenant_status_idx" ON "social_posts" USING btree ("tenant_id", "status");
    CREATE INDEX IF NOT EXISTS "post_metrics_tenant_recorded_at_idx" ON "post_metrics" USING btree ("tenant_id", "recorded_at");

    -- Segments: reemplaza el único GLOBAL de name por uno compuesto por tenant.
    -- Dos tenants distintos deben poder tener ambos un rubro "Restaurantes".
    DROP INDEX IF EXISTS "segments_name_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "tenant_name_idx" ON "segments" USING btree ("tenant_id", "name");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "tenant_name_idx";
    CREATE UNIQUE INDEX IF NOT EXISTS "segments_name_idx" ON "segments" USING btree ("name");

    DROP INDEX IF EXISTS "post_metrics_tenant_recorded_at_idx";
    DROP INDEX IF EXISTS "social_posts_tenant_status_idx";
    DROP INDEX IF EXISTS "notifications_tenant_read_idx";
    DROP INDEX IF EXISTS "email_log_campaign_status_idx";
    DROP INDEX IF EXISTS "messages_tenant_conversation_sent_idx";
    DROP INDEX IF EXISTS "conversations_tenant_last_message_idx";
    DROP INDEX IF EXISTS "clients_tenant_stage_idx";
    DROP INDEX IF EXISTS "leads_tenant_status_idx";
    DROP INDEX IF EXISTS "tasks_tenant_due_date_idx";
    DROP INDEX IF EXISTS "tasks_tenant_status_idx";
    DROP INDEX IF EXISTS "payments_tenant_due_date_idx";
    DROP INDEX IF EXISTS "payments_tenant_status_idx";
  `)
}
