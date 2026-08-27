import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const PostMetrics: CollectionConfig = {
  slug: 'post-metrics',
  labels: {
    singular: 'Métrica de Publicación',
    plural: 'Métricas de Publicaciones',
  },
  admin: {
    useAsTitle: 'recordedAt',
    defaultColumns: ['post', 'impressions', 'reach', 'likes', 'comments', 'recordedAt'],
    group: 'Social',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'social-posts',
      required: true,
      label: 'Publicación',
    },
    {
      name: 'recordedAt',
      type: 'date',
      required: true,
      label: 'Fecha del registro de métricas',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'impressions',
      type: 'number',
      defaultValue: 0,
      label: 'Impresiones',
    },
    {
      name: 'reach',
      type: 'number',
      defaultValue: 0,
      label: 'Alcance',
    },
    {
      name: 'likes',
      type: 'number',
      defaultValue: 0,
      label: 'Me gusta (Likes)',
    },
    {
      name: 'comments',
      type: 'number',
      defaultValue: 0,
      label: 'Comentarios',
    },
    {
      name: 'shares',
      type: 'number',
      defaultValue: 0,
      label: 'Compartidos (Shares)',
    },
    {
      name: 'saved',
      type: 'number',
      defaultValue: 0,
      label: 'Guardados (Saved)',
    },
    {
      name: 'rawMetrics',
      type: 'json',
      label: 'Respuesta completa de Graph API',
    },
  ],
}
