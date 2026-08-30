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
import * as migration_20260830_040000_database_rls_and_performance_hardening from './20260830_040000_database_rls_and_performance_hardening';

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
    name: '20260825_073712_import_export_plugin'
  },
  {
    up: migration_20260825_074436_facturacion_cotizaciones.up,
    down: migration_20260825_074436_facturacion_cotizaciones.down,
    name: '20260825_074436_facturacion_cotizaciones'
  },
  {
    up: migration_20260829_210000_fix_invoices_quotes_tenant.up,
    down: migration_20260829_210000_fix_invoices_quotes_tenant.down,
    name: '20260829_210000_fix_invoices_quotes_tenant'
  },
  {
    up: migration_20260829_220000_lead_pipeline_fields.up,
    down: migration_20260829_220000_lead_pipeline_fields.down,
    name: '20260829_220000_lead_pipeline_fields'
  },
  {
    up: migration_20260830_010000_social_mcp_ready.up,
    down: migration_20260830_010000_social_mcp_ready.down,
    name: '20260830_010000_social_mcp_ready'
  },
  {
    up: migration_20260830_020000_mcp_api_keys_ready.up,
    down: migration_20260830_020000_mcp_api_keys_ready.down,
    name: '20260830_020000_mcp_api_keys_ready'
  },
  {
    up: migration_20260830_030000_tasks_forms_summaries_ready.up,
    down: migration_20260830_030000_tasks_forms_summaries_ready.down,
    name: '20260830_030000_tasks_forms_summaries_ready'
  },
  {
    up: migration_20260830_040000_database_rls_and_performance_hardening.up,
    down: migration_20260830_040000_database_rls_and_performance_hardening.down,
    name: '20260830_040000_database_rls_and_performance_hardening'
  },
];
