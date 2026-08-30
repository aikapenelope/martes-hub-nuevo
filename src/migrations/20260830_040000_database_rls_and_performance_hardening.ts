import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migración de endurecimiento de base de datos, RLS e índices:
 *
 * 1. Activa Row Level Security (RLS) en todas las tablas sensibles del esquema público
 *    y define políticas seguras para el rol de servicio (service_role) de Payload / Supabase.
 * 2. Agrega índices B-Tree compuestos y de claves foráneas para eliminar cuellos de botella
 *    en consultas frecuentes del CRM, Dashboard, Jobs y Pipeline.
 * 3. Reemplaza el índice único global de segments(name) por un índice único compuesto
 *    scoped por tenant: segments(tenant_id, name).
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- 1. Activar RLS en todas las tablas de la aplicación y relaciones
  ALTER TABLE IF EXISTS "tenants" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "users" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "users_roles" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "users_tenants" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "clients" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "leads" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "activities" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "segments" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "documents" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "media" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "company_settings" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payments" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "memberships" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "conversations" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "messages" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "message_templates" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "notifications" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "email_log" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "email_campaigns" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "offers" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "invoices" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "quotes" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "form_submissions" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "tasks" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "tasks_checklist" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "conversation_summaries" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "conversation_summaries_key_topics" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "social_accounts" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "social_posts" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "social_posts_media" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "post_metrics" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_mcp_api_keys" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_jobs" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_jobs_log" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_jobs_stats" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_locked_documents" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_locked_documents_rels" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_preferences" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS "payload_preferences_rels" ENABLE ROW LEVEL SECURITY;

  -- 2. Políticas RLS seguras para service_role (Payload CMS backend)
  DO $$ 
  DECLARE
    tbl text;
    tables text[] := ARRAY[
      'tenants', 'users', 'users_roles', 'users_tenants', 'clients', 'leads', 
      'activities', 'segments', 'documents', 'media', 'company_settings', 
      'payments', 'memberships', 'conversations', 'messages', 'message_templates', 
      'notifications', 'email_log', 'email_campaigns', 'offers', 'invoices', 
      'quotes', 'form_submissions', 'tasks', 'tasks_checklist', 
      'conversation_summaries', 'conversation_summaries_key_topics', 
      'social_accounts', 'social_posts', 'social_posts_media', 'post_metrics', 
      'payload_mcp_api_keys', 'payload_jobs', 'payload_jobs_log', 'payload_jobs_stats', 
      'payload_locked_documents', 'payload_locked_documents_rels', 
      'payload_preferences', 'payload_preferences_rels'
    ];
  BEGIN
    FOREACH tbl IN ARRAY tables LOOP
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%I" ON %I', tbl, tbl);
      EXECUTE format('CREATE POLICY "service_role_all_%I" ON %I TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
  END $$;

  -- 3. Índices de rendimiento para Payments
  CREATE INDEX IF NOT EXISTS "payments_tenant_status_idx" ON "payments" USING btree ("tenant_id", "status");
  CREATE INDEX IF NOT EXISTS "payments_tenant_due_date_idx" ON "payments" USING btree ("tenant_id", "due_date");
  CREATE INDEX IF NOT EXISTS "payments_tenant_paid_at_idx" ON "payments" USING btree ("tenant_id", "paid_at");

  -- 4. Índices de rendimiento para Tasks
  CREATE INDEX IF NOT EXISTS "tasks_tenant_status_idx" ON "tasks" USING btree ("tenant_id", "status");
  CREATE INDEX IF NOT EXISTS "tasks_tenant_priority_idx" ON "tasks" USING btree ("tenant_id", "priority");
  CREATE INDEX IF NOT EXISTS "tasks_tenant_due_date_idx" ON "tasks" USING btree ("tenant_id", "due_date");

  -- 5. Índices de rendimiento para Leads
  CREATE INDEX IF NOT EXISTS "leads_tenant_status_idx" ON "leads" USING btree ("tenant_id", "status");
  CREATE INDEX IF NOT EXISTS "leads_tenant_segment_idx" ON "leads" USING btree ("tenant_id", "segment_id");
  CREATE INDEX IF NOT EXISTS "leads_tenant_converted_client_idx" ON "leads" USING btree ("tenant_id", "converted_client_id");

  -- 6. Índices de rendimiento para Clients
  CREATE INDEX IF NOT EXISTS "clients_tenant_stage_idx" ON "clients" USING btree ("tenant_id", "stage");
  CREATE INDEX IF NOT EXISTS "clients_tenant_segment_idx" ON "clients" USING btree ("tenant_id", "segment_id");

  -- 7. Índices de rendimiento y FKs para Conversations
  CREATE INDEX IF NOT EXISTS "conversations_tenant_idx" ON "conversations" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "conversations_lead_idx" ON "conversations" USING btree ("lead_id");
  CREATE INDEX IF NOT EXISTS "conversations_client_idx" ON "conversations" USING btree ("client_id");
  CREATE INDEX IF NOT EXISTS "conversations_tenant_last_inbound_idx" ON "conversations" USING btree ("tenant_id", "last_inbound_at");
  CREATE INDEX IF NOT EXISTS "conversations_tenant_last_message_idx" ON "conversations" USING btree ("tenant_id", "last_message_at");

  -- 8. Índices de rendimiento para Messages
  CREATE INDEX IF NOT EXISTS "messages_tenant_idx" ON "messages" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "messages_conversation_idx" ON "messages" USING btree ("conversation_id");
  CREATE INDEX IF NOT EXISTS "messages_tenant_conv_sent_idx" ON "messages" USING btree ("tenant_id", "conversation_id", "sent_at");

  -- 9. Índices de rendimiento para Email Log
  CREATE INDEX IF NOT EXISTS "email_log_tenant_idx" ON "email_log" USING btree ("tenant_id");
  CREATE INDEX IF NOT EXISTS "email_log_campaign_status_idx" ON "email_log" USING btree ("campaign_id", "status");
  CREATE INDEX IF NOT EXISTS "email_log_provider_msg_id_idx" ON "email_log" USING btree ("provider_message_id");

  -- 10. Índices de rendimiento para Notifications
  CREATE INDEX IF NOT EXISTS "notifications_tenant_read_idx" ON "notifications" USING btree ("tenant_id", "read");

  -- 11. Índices de rendimiento para Social Posts y Metrics
  CREATE INDEX IF NOT EXISTS "social_posts_tenant_status_idx" ON "social_posts" USING btree ("tenant_id", "status");
  CREATE INDEX IF NOT EXISTS "post_metrics_tenant_post_idx" ON "post_metrics" USING btree ("tenant_id", "post_id");

  -- 12. Migración del índice único global de Segments a índice único compuesto por tenant
  DROP INDEX IF EXISTS "segments_name_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "segments_tenant_name_idx" ON "segments" USING btree ("tenant_id", "name");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "segments_tenant_name_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "segments_name_idx" ON "segments" USING btree ("name");

  DROP INDEX IF EXISTS "post_metrics_tenant_post_idx";
  DROP INDEX IF EXISTS "social_posts_tenant_status_idx";
  DROP INDEX IF EXISTS "notifications_tenant_read_idx";
  DROP INDEX IF EXISTS "email_log_provider_msg_id_idx";
  DROP INDEX IF EXISTS "email_log_campaign_status_idx";
  DROP INDEX IF EXISTS "email_log_tenant_idx";
  DROP INDEX IF EXISTS "messages_tenant_conv_sent_idx";
  DROP INDEX IF EXISTS "messages_conversation_idx";
  DROP INDEX IF EXISTS "messages_tenant_idx";
  DROP INDEX IF EXISTS "conversations_tenant_last_message_idx";
  DROP INDEX IF EXISTS "conversations_tenant_last_inbound_idx";
  DROP INDEX IF EXISTS "conversations_client_idx";
  DROP INDEX IF EXISTS "conversations_lead_idx";
  DROP INDEX IF EXISTS "conversations_tenant_idx";
  DROP INDEX IF EXISTS "clients_tenant_segment_idx";
  DROP INDEX IF EXISTS "clients_tenant_stage_idx";
  DROP INDEX IF EXISTS "leads_tenant_converted_client_idx";
  DROP INDEX IF EXISTS "leads_tenant_segment_idx";
  DROP INDEX IF EXISTS "leads_tenant_status_idx";
  DROP INDEX IF EXISTS "tasks_tenant_due_date_idx";
  DROP INDEX IF EXISTS "tasks_tenant_priority_idx";
  DROP INDEX IF EXISTS "tasks_tenant_status_idx";
  DROP INDEX IF EXISTS "payments_tenant_paid_at_idx";
  DROP INDEX IF EXISTS "payments_tenant_due_date_idx";
  DROP INDEX IF EXISTS "payments_tenant_status_idx";

  DO $$ 
  DECLARE
    tbl text;
    tables text[] := ARRAY[
      'tenants', 'users', 'users_roles', 'users_tenants', 'clients', 'leads', 
      'activities', 'segments', 'documents', 'media', 'company_settings', 
      'payments', 'memberships', 'conversations', 'messages', 'message_templates', 
      'notifications', 'email_log', 'email_campaigns', 'offers', 'invoices', 
      'quotes', 'form_submissions', 'tasks', 'tasks_checklist', 
      'conversation_summaries', 'conversation_summaries_key_topics', 
      'social_accounts', 'social_posts', 'social_posts_media', 'post_metrics', 
      'payload_mcp_api_keys', 'payload_jobs', 'payload_jobs_log', 'payload_jobs_stats', 
      'payload_locked_documents', 'payload_locked_documents_rels', 
      'payload_preferences', 'payload_preferences_rels'
    ];
  BEGIN
    FOREACH tbl IN ARRAY tables LOOP
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%I" ON %I', tbl, tbl);
    END LOOP;
  END $$;
  `)
}
