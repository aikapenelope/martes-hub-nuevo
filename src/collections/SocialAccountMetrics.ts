import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

/**
 * Métricas diarias de la cuenta de Instagram conectada (doc 01 v3): una fila
 * por (tenant, cuenta, fecha). La escribe el job `sync-instagram-metrics`.
 * Alimenta el sparkline de seguidores y las tarjetas de cuenta del hub social.
 */
export const SocialAccountMetrics: CollectionConfig = {
  slug: 'social-account-metrics',
  labels: {
    singular: 'Métrica de Cuenta Social',
    plural: 'Métricas de Cuentas Sociales',
  },
  admin: {
    useAsTitle: 'recordedAt',
    defaultColumns: ['socialAccount', 'followerCount', 'reach', 'recordedAt'],
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
      name: 'socialAccount',
      type: 'relationship',
      relationTo: 'social-accounts',
      required: true,
      label: 'Cuenta',
    },
    {
      name: 'recordedAt',
      type: 'date',
      required: true,
      label: 'Fecha del registro',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'followerCount',
      type: 'number',
      defaultValue: 0,
      label: 'Seguidores',
    },
    {
      name: 'profileViews',
      type: 'number',
      defaultValue: 0,
      label: 'Visitas al perfil',
    },
    {
      name: 'websiteClicks',
      type: 'number',
      defaultValue: 0,
      label: 'Clics al sitio web',
    },
    {
      name: 'reach',
      type: 'number',
      defaultValue: 0,
      label: 'Alcance (30d)',
    },
    {
      name: 'rawMetrics',
      type: 'json',
      label: 'Respuesta cruda de Composio',
    },
  ],
}
