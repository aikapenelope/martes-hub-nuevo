import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  admin: {
    useAsTitle: 'contactAddress',
    defaultColumns: ['contactAddress', 'channel', 'client', 'lastMessageAt'],
    group: 'Mensajería',
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
      name: 'channel',
      type: 'select',
      required: true,
      defaultValue: 'whatsapp',
      label: 'Canal',
      options: ['whatsapp', 'instagram_dm', 'whatsapp_web'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'openbspId',
      type: 'text',
      index: true,
      label: 'ID OpenBSP',
      admin: {
        description: 'UUID de la conversación en OpenBSP; lo rellena el webhook',
      },
    },
    {
      name: 'organizationAddress',
      type: 'text',
      label: 'Número de negocio (phone_number_id)',
      admin: { position: 'sidebar' },
    },
    {
      name: 'contactAddress',
      type: 'text',
      required: true,
      label: 'Contacto (E.164 sin +)',
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
      name: 'lastMessageAt',
      type: 'date',
      label: 'Último mensaje',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastInboundAt',
      type: 'date',
      label: 'Último entrante (ventana 24h)',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Si es mayor a 24h, solo se pueden enviar plantillas',
      },
    },
  ],
}
