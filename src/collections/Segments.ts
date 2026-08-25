import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Segments: CollectionConfig = {
  slug: 'segments',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description'],
    group: 'CRM',
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
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      label: 'Nombre del rubro',
    },
    {
      name: 'description',
      type: 'text',
      label: 'Descripción',
    },
  ],
}
