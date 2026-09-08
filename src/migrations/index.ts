import * as migration_20260824_201843_f0_init from './20260824_201843_f0_init';
import * as migration_20260825_021413_f1_core_collections from './20260825_021413_f1_core_collections';
import * as migration_20260825_023329_f1b_multi_tenant from './20260825_023329_f1b_multi_tenant';
import * as migration_20260825_041101_f1d_kanban_fields from './20260825_041101_f1d_kanban_fields';
import * as migration_20260825_042019_f2_money_collections from './20260825_042019_f2_money_collections';
import * as migration_20260825_044143_f3a_messaging_collections from './20260825_044143_f3a_messaging_collections';
import * as migration_20260825_051138_f3d_notifications from './20260825_051138_f3d_notifications';
import * as migration_20260825_071209_f5_email_collections from './20260825_071209_f5_email_collections';
import * as migration_20260825_073712_import_export_plugin from './20260825_073712_import_export_plugin';
import * as migration_20260825_074436_facturacion_cotizaciones from './20260825_074436_facturacion_cotizaciones';
import * as migration_20260829_210000_fix_invoices_quotes_tenant from './20260829_210000_fix_invoices_quotes_tenant';
import * as migration_20260829_220000_lead_pipeline_fields from './20260829_220000_lead_pipeline_fields';
import * as migration_20260830_010000_social_mcp_ready from './20260830_010000_social_mcp_ready';
import * as migration_20260830_020000_mcp_api_keys_ready from './20260830_020000_mcp_api_keys_ready';
import * as migration_20260830_030000_tasks_forms_summaries_ready from './20260830_030000_tasks_forms_summaries_ready';
import * as migration_20260830_050000_performance_indexes_and_segments_unique from './20260830_050000_performance_indexes_and_segments_unique';
import * as migration_20260831_190000_leads_clients_enrichment_sync from './20260831_190000_leads_clients_enrichment_sync';
import * as migration_20260901_030726_add_chatwoot_conversation_model from './20260901_030726_add_chatwoot_conversation_model';
import * as migration_20260901_120000_companies_and_email_log_links from './20260901_120000_companies_and_email_log_links';
import * as migration_20260901_130000_email_messages_mirror from './20260901_130000_email_messages_mirror';
import * as migration_20260901_140000_appointments_gcal_mirror from './20260901_140000_appointments_gcal_mirror';
import * as migration_20260902_180000_fix_locked_documents_rels from './20260902_180000_fix_locked_documents_rels';
import * as migration_20260903_190000_notifications_occurred_at from './20260903_190000_notifications_occurred_at';
import * as migration_20260904_120000_form_submissions_event_id from './20260904_120000_form_submissions_event_id';
import * as migration_20260904_144000_add_ai_worker_settings from './20260904_144000_add_ai_worker_settings';
import * as migration_20260906_025046_add_notes_collection from './20260906_025046_add_notes_collection';
import * as migration_20260906_035000_messages_idempotency_key from './20260906_035000_messages_idempotency_key';
import * as migration_20260906_223000_add_whiteboards_and_versions from './20260906_223000_add_whiteboards_and_versions';

export const migrations = [
  {
    up: migration_20260824_201843_f0_init.up,
    down: migration_20260824_201843_f0_init.down,
    name: '20260824_201843_f0_init',
  },
  {
    up: migration_20260825_021413_f1_core_collections.up,
    down: migration_20260825_021413_f1_core_collections.down,
    name: '20260825_021413_f1_core_collections',
  },
  {
    up: migration_20260825_023329_f1b_multi_tenant.up,
    down: migration_20260825_023329_f1b_multi_tenant.down,
    name: '20260825_023329_f1b_multi_tenant',
  },
  {
    up: migration_20260825_041101_f1d_kanban_fields.up,
    down: migration_20260825_041101_f1d_kanban_fields.down,
    name: '20260825_041101_f1d_kanban_fields',
  },
  {
    up: migration_20260825_042019_f2_money_collections.up,
    down: migration_20260825_042019_f2_money_collections.down,
    name: '20260825_042019_f2_money_collections',
  },
  {
    up: migration_20260825_044143_f3a_messaging_collections.up,
    down: migration_20260825_044143_f3a_messaging_collections.down,
    name: '20260825_044143_f3a_messaging_collections',
  },
  {
    up: migration_20260825_051138_f3d_notifications.up,
    down: migration_20260825_051138_f3d_notifications.down,
    name: '20260825_051138_f3d_notifications',
  },
  {
    up: migration_20260825_071209_f5_email_collections.up,
    down: migration_20260825_071209_f5_email_collections.down,
    name: '20260825_071209_f5_email_collections',
  },
  {
    up: migration_20260825_073712_import_export_plugin.up,
    down: migration_20260825_073712_import_export_plugin.down,
    name: '20260825_073712_import_export_plugin',
  },
  {
    up: migration_20260825_074436_facturacion_cotizaciones.up,
    down: migration_20260825_074436_facturacion_cotizaciones.down,
    name: '20260825_074436_facturacion_cotizaciones',
  },
  {
    up: migration_20260829_210000_fix_invoices_quotes_tenant.up,
    down: migration_20260829_210000_fix_invoices_quotes_tenant.down,
    name: '20260829_210000_fix_invoices_quotes_tenant',
  },
  {
    up: migration_20260829_220000_lead_pipeline_fields.up,
    down: migration_20260829_220000_lead_pipeline_fields.down,
    name: '20260829_220000_lead_pipeline_fields',
  },
  {
    up: migration_20260830_010000_social_mcp_ready.up,
    down: migration_20260830_010000_social_mcp_ready.down,
    name: '20260830_010000_social_mcp_ready',
  },
  {
    up: migration_20260830_020000_mcp_api_keys_ready.up,
    down: migration_20260830_020000_mcp_api_keys_ready.down,
    name: '20260830_020000_mcp_api_keys_ready',
  },
  {
    up: migration_20260830_030000_tasks_forms_summaries_ready.up,
    down: migration_20260830_030000_tasks_forms_summaries_ready.down,
    name: '20260830_030000_tasks_forms_summaries_ready',
  },
  {
    up: migration_20260830_050000_performance_indexes_and_segments_unique.up,
    down: migration_20260830_050000_performance_indexes_and_segments_unique.down,
    name: '20260830_050000_performance_indexes_and_segments_unique',
  },
  {
    up: migration_20260831_190000_leads_clients_enrichment_sync.up,
    down: migration_20260831_190000_leads_clients_enrichment_sync.down,
    name: '20260831_190000_leads_clients_enrichment_sync',
  },
  {
    up: migration_20260901_030726_add_chatwoot_conversation_model.up,
    down: migration_20260901_030726_add_chatwoot_conversation_model.down,
    name: '20260901_030726_add_chatwoot_conversation_model',
  },
  {
    up: migration_20260901_120000_companies_and_email_log_links.up,
    down: migration_20260901_120000_companies_and_email_log_links.down,
    name: '20260901_120000_companies_and_email_log_links',
  },
  {
    up: migration_20260901_130000_email_messages_mirror.up,
    down: migration_20260901_130000_email_messages_mirror.down,
    name: '20260901_130000_email_messages_mirror',
  },
  {
    up: migration_20260901_140000_appointments_gcal_mirror.up,
    down: migration_20260901_140000_appointments_gcal_mirror.down,
    name: '20260901_140000_appointments_gcal_mirror',
  },
  {
    up: migration_20260902_180000_fix_locked_documents_rels.up,
    down: migration_20260902_180000_fix_locked_documents_rels.down,
    name: '20260902_180000_fix_locked_documents_rels',
  },
  {
    up: migration_20260903_190000_notifications_occurred_at.up,
    down: migration_20260903_190000_notifications_occurred_at.down,
    name: '20260903_190000_notifications_occurred_at',
  },
  {
    up: migration_20260904_120000_form_submissions_event_id.up,
    down: migration_20260904_120000_form_submissions_event_id.down,
    name: '20260904_120000_form_submissions_event_id',
  },
  {
    up: migration_20260904_144000_add_ai_worker_settings.up,
    down: migration_20260904_144000_add_ai_worker_settings.down,
    name: '20260904_144000_add_ai_worker_settings',
  },
  {
    up: migration_20260906_025046_add_notes_collection.up,
    down: migration_20260906_025046_add_notes_collection.down,
    name: '20260906_025046_add_notes_collection',
  },
  {
    up: migration_20260906_035000_messages_idempotency_key.up,
    down: migration_20260906_035000_messages_idempotency_key.down,
    name: '20260906_035000_messages_idempotency_key',
  },
  {
    up: migration_20260906_223000_add_whiteboards_and_versions.up,
    down: migration_20260906_223000_add_whiteboards_and_versions.down,
    name: '20260906_223000_add_whiteboards_and_versions'
  },
];

import * as migration_20260906_204500_tasks_lead_hot_enum from './20260906_204500_tasks_lead_hot_enum';
import * as migration_20260906_204706_add_lead_briefs from './20260906_204706_add_lead_briefs';
migrations.push({
  up: migration_20260906_204500_tasks_lead_hot_enum.up,
  down: migration_20260906_204500_tasks_lead_hot_enum.down,
  name: '20260906_204500_tasks_lead_hot_enum',
});
migrations.push({
  up: migration_20260906_204706_add_lead_briefs.up,
  down: migration_20260906_204706_add_lead_briefs.down,
  name: '20260906_204706_add_lead_briefs',
});

import * as migration_20260906_201443_leads_fibery_fields from './20260906_201443_leads_fibery_fields';
migrations.push({
  up: migration_20260906_201443_leads_fibery_fields.up,
  down: migration_20260906_201443_leads_fibery_fields.down,
  name: '20260906_201443_leads_fibery_fields',
});

import * as migration_20260906_200303_add_payment_methods_columns from './20260906_200303_add_payment_methods_columns';
migrations.push({
  up: migration_20260906_200303_add_payment_methods_columns.up,
  down: migration_20260906_200303_add_payment_methods_columns.down,
  name: '20260906_200303_add_payment_methods_columns',
});

import * as migration_20260907_234500_leads_converted_at from './20260907_234500_leads_converted_at';
migrations.push({
  up: migration_20260907_234500_leads_converted_at.up,
  down: migration_20260907_234500_leads_converted_at.down,
  name: '20260907_234500_leads_converted_at',
});

import * as migration_20260908_060000_add_recalculate_lead_scores_slug from './20260908_060000_add_recalculate_lead_scores_slug';
migrations.push({
  up: migration_20260908_060000_add_recalculate_lead_scores_slug.up,
  down: migration_20260908_060000_add_recalculate_lead_scores_slug.down,
  name: '20260908_060000_add_recalculate_lead_scores_slug',
});

import * as migration_20260908_181500_create_sequences_and_enrollments from './20260908_181500_create_sequences_and_enrollments';
migrations.push({
  up: migration_20260908_181500_create_sequences_and_enrollments.up,
  down: migration_20260908_181500_create_sequences_and_enrollments.down,
  name: '20260908_181500_create_sequences_and_enrollments',
});

import * as migration_20260908_193000_sequence_step_identity from './20260908_193000_sequence_step_identity';
migrations.push({
  up: migration_20260908_193000_sequence_step_identity.up,
  down: migration_20260908_193000_sequence_step_identity.down,
  name: '20260908_193000_sequence_step_identity',
});

import * as migration_20260908_193000_create_saved_crm_views from './20260908_193000_create_saved_crm_views';
migrations.push({
  up: migration_20260908_193000_create_saved_crm_views.up,
  down: migration_20260908_193000_create_saved_crm_views.down,
  name: '20260908_193000_create_saved_crm_views',
});

import * as migration_20260908_210000_create_invoice_media from './20260908_210000_create_invoice_media';
migrations.push({
  up: migration_20260908_210000_create_invoice_media.up,
  down: migration_20260908_210000_create_invoice_media.down,
  name: '20260908_210000_create_invoice_media',
});
