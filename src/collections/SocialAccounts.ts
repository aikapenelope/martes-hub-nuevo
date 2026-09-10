import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

export const SocialAccounts: CollectionConfig = {
  slug: 'social-accounts',
  labels: {
    singular: 'Cuenta Social',
    plural: 'Cuentas Sociales',
  },
  admin: {
    useAsTitle: 'accountName',
    defaultColumns: ['accountName', 'platform', 'status', 'createdAt'],
    group: 'Social',
  },
  access: {
    read: authenticated,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'accountName',
      type: 'text',
      required: true,
      label: 'Nombre de la cuenta / Página',
    },
    {
      name: 'platform',
      type: 'select',
      required: true,
      label: 'Plataforma',
      options: [
        { label: 'Instagram Business', value: 'instagram' },
        { label: 'TikTok Business', value: 'tiktok' },
        { label: 'Facebook Page', value: 'facebook' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'platformAccountId',
      type: 'text',
      required: true,
      label: 'ID de la cuenta en la plataforma',
      admin: {
        description: 'Page ID, Instagram Business Account ID, o el identificador equivalente en tu gestor de redes (p. ej. Metricool)',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'conectada',
      label: 'Estado de conexión',
      options: [
        { label: 'Conectada', value: 'conectada' },
        { label: 'Desconectada', value: 'desconectada' },
        { label: 'Expirada', value: 'expirada' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'profilePictureUrl',
      type: 'text',
      label: 'Foto de perfil / Avatar',
    },
    {
      name: 'composioConnectedAccountId',
      type: 'text',
      label: 'Connected account de Composio (conn_…)',
      admin: {
        description: 'Referencia a la conexión del tenant en Composio — los tokens viven allá, nunca aquí.',
        position: 'sidebar',
      },
    },
    {
      name: 'externalUserId',
      type: 'text',
      label: 'ID externo (IG user id)',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'syncStatus',
      type: 'select',
      label: 'Estado de sync',
      defaultValue: 'sin_conectar',
      options: [
        { label: 'Sin conectar', value: 'sin_conectar' },
        { label: 'OK', value: 'ok' },
        { label: 'Error de token', value: 'error_token' },
        { label: 'Error de API', value: 'error_api' },
      ],
      admin: {
        position: 'sidebar',
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
