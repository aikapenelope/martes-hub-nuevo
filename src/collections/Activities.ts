import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Activities: CollectionConfig = {
  slug: 'activities',
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['occurredAt', 'type', 'client', 'lead', 'performedBy'],
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
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'nota',
      label: 'Tipo',
      options: [
        { label: 'Nota', value: 'nota' },
        { label: 'Llamada', value: 'llamada' },
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Email', value: 'email' },
        { label: 'Reunión', value: 'reunion' },
        { label: 'Otro', value: 'otro' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'occurredAt',
      type: 'date',
      required: true,
      label: 'Fecha de la interacción',
      defaultValue: () => new Date(),
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      label: 'Resumen',
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead',
    },
    {
      name: 'performedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Registrada por',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data?.client && !data?.lead) {
          throw new Error('La actividad debe estar vinculada a un cliente o a un lead')
        }
        return data
      },
    ],
    beforeChange: [
      ({ req, data }) => {
        if (!data.performedBy && req.user) {
          data.performedBy = req.user.id
        }
        return data
      },
    ],
  },
}
