import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access'

export const INTEGRATION_TOOLKITS = [
  'instagram',
  'tiktok',
  'gmail',
  'googlecalendar',
  'googlesheets',
  'googledocs',
] as const

export type IntegrationToolkit = (typeof INTEGRATION_TOOLKITS)[number]

export const CONNECTION_STATES = [
  'conectando',
  'ok',
  'error_token',
  'error_api',
  'desconectado',
] as const

/**
 * Estado de conexión de un tenant con un toolkit de Composio. Dos alcances:
 * - `empresa`: la cuenta compartida del negocio (Instagram corporativo, correo
 *   info@, calendario de la empresa) — la conecta un admin y la usa todo el
 *   tenant (jobs de sync, publicación).
 * - `personal`: la cuenta de UN usuario (su Gmail, su calendario) — la conecta
 *   cada quien y queda atribuida a su usuario.
 * En ambos casos la key es la del proyecto Composio del tenant
 * (`tenant-integrations`): el tenant es responsable de todas las llamadas.
 */
export const TenantConnections: CollectionConfig = {
  slug: 'tenant-connections',
  labels: {
    singular: 'Conexión del Tenant',
    plural: 'Conexiones de Tenants',
  },
  admin: {
    useAsTitle: 'toolkit',
    group: 'Configuración',
    description: 'Conexiones por servicio (login del tenant vía Composio), de la empresa o personales.',
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'toolkit',
      type: 'select',
      required: true,
      label: 'Toolkit',
      options: INTEGRATION_TOOLKITS.map((slug) => ({
        label: slug.charAt(0).toUpperCase() + slug.slice(1),
        value: slug,
      })),
    },
    {
      name: 'scope',
      type: 'select',
      required: true,
      defaultValue: 'empresa',
      label: 'Alcance',
      options: [
        { label: 'De la empresa (compartida)', value: 'empresa' },
        { label: 'Personal de un usuario', value: 'personal' },
      ],
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      label: 'Usuario (solo alcance personal)',
      admin: {
        description: 'Dueño de la cuenta personal. Vacío en conexiones de la empresa.',
      },
    },
    {
      name: 'authConfigId',
      type: 'text',
      label: 'Auth config (ac_…)',
      admin: {
        description: 'Auth config gestionado de Composio para este toolkit.',
        position: 'sidebar',
      },
    },
    {
      name: 'connectedAccountId',
      type: 'text',
      label: 'Connected account (conn_…)',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'connectedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Autorizada por',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'conectando',
      label: 'Estado',
      options: CONNECTION_STATES.map((value) => ({ label: value, value })),
    },
    {
      name: 'ultimoError',
      type: 'textarea',
      label: 'Último error',
      admin: {
        description: 'Error crudo de Composio — sin fallback, se muestra en la UI.',
      },
    },
    {
      name: 'config',
      type: 'json',
      label: 'Config del toolkit',
      admin: {
        description: 'Ej.: { "calendarId": "…", "mailbox": "…" } según el toolkit.',
      },
    },
    {
      name: 'lastSyncAt',
      type: 'date',
      label: 'Último sync',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
