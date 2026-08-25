import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['read', 'severity', 'title', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: authenticated,
    create: () => false,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'body',
      type: 'textarea',
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      defaultValue: 'info',
      label: 'Severidad',
      options: ['info', 'warning', 'error'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'source',
      type: 'text',
      label: 'Origen',
      admin: {
        position: 'sidebar',
        description: 'openbsp / jobs / formularios…',
      },
    },
    {
      name: 'read',
      type: 'checkbox',
      defaultValue: false,
      label: 'Leída',
      admin: { position: 'sidebar' },
    },
  ],
}
