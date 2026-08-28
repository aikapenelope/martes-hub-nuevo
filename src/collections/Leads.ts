import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'status', 'source', 'segment', 'createdAt'],
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
      name: 'fullName',
      type: 'text',
      required: true,
      label: 'Nombre',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'nuevo',
      label: 'Pipeline',
      options: [
        { label: 'Nuevo', value: 'nuevo' },
        { label: 'Contactado', value: 'contactado' },
        { label: 'Calificado', value: 'calificado' },
        { label: 'Descartado', value: 'descartado' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      label: 'Origen',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Apify', value: 'apify' },
        { label: 'Tally', value: 'tally' },
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Instagram DM', value: 'instagram_dm' },
        { label: 'Referido', value: 'referido' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'phone',
      type: 'text',
      index: true,
      label: 'Teléfono (WhatsApp)',
    },
    {
      name: 'email',
      type: 'email',
      index: true,
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'convertedClient',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Convertido a cliente',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Se llena automáticamente al convertir el lead',
      },
    },
  ],
}
