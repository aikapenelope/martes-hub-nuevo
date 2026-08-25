import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Documents: CollectionConfig = {
  slug: 'documents',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'client', 'documentType', 'updatedAt'],
    group: 'CRM',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  upload: {
    mimeTypes: ['application/pdf'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Título',
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      required: true,
      label: 'Cliente',
    },
    {
      name: 'documentType',
      type: 'select',
      required: true,
      defaultValue: 'contrato',
      label: 'Tipo',
      options: ['contrato', 'factura', 'otro'],
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
