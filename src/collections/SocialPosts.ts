import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const SocialPosts: CollectionConfig = {
  slug: 'social-posts',
  labels: {
    singular: 'Publicación Social',
    plural: 'Publicaciones Sociales',
  },
  admin: {
    useAsTitle: 'caption',
    defaultColumns: ['caption', 'account', 'status', 'scheduledAt', 'publishedAt', 'createdAt'],
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
      name: 'caption',
      type: 'textarea',
      required: true,
      label: 'Copy / Texto del post',
    },
    {
      name: 'account',
      type: 'relationship',
      relationTo: 'social-accounts',
      required: true,
      label: 'Cuenta de destino',
    },
    {
      name: 'media',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
      label: 'Imágenes / Videos adjuntos',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'borrador',
      label: 'Estado de publicación',
      options: ['borrador', 'programado', 'publicado', 'fallido'],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'scheduledAt',
      type: 'date',
      label: 'Fecha y hora programada',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Fecha de publicación',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'platformPostId',
      type: 'text',
      label: 'ID de la publicación en Meta',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'permalink',
      type: 'text',
      label: 'Enlace público del post',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'lastError',
      type: 'textarea',
      label: 'Último error reportado',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
