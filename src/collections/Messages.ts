import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

export const Messages: CollectionConfig = {
  slug: 'messages',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['conversation', 'direction', 'type', 'text', 'sentAt'],
    group: 'Mensajería',
  },
  access: {
    // Solo lectura desde el admin: las filas las crea el webhook (entrantes/ecos)
    // o el endpoint de respuesta (overrideAccess). Evita datos fuera de sync con OpenBSP.
    read: authenticated,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'conversation',
      type: 'relationship',
      relationTo: 'conversations',
      required: true,
      label: 'Conversación',
    },
    {
      name: 'direction',
      type: 'select',
      required: true,
      label: 'Dirección',
      options: ['inbound', 'outbound'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'openbspId',
      type: 'text',
      index: true,
      label: 'ID OpenBSP (uuid)',
      admin: { position: 'sidebar' },
    },
    {
      name: 'externalId',
      type: 'text',
      index: true,
      label: 'WAMID (Meta)',
      admin: {
        position: 'sidebar',
        description: 'Idempotencia: reintentos del webhook no duplican',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'text',
      label: 'Tipo',
      options: [
        'text',
        'image',
        'video',
        'audio',
        'document',
        'sticker',
        'template',
        'location',
        'contacts',
        'unknown',
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'text',
      type: 'textarea',
      label: 'Texto / caption',
    },
    {
      name: 'content',
      type: 'json',
      label: 'Content crudo OpenBSP',
      admin: {
        description: 'Fidelidad total del objeto content recibido/enviado',
      },
    },
    {
      name: 'statusJson',
      type: 'json',
      label: 'Estados Meta',
      admin: {
        description: '{accepted, sent, delivered, read, failed, errors[]}',
      },
    },
    {
      name: 'senderAddress',
      type: 'text',
      label: 'Remitente (null en salientes)',
      admin: { position: 'sidebar' },
    },
    {
      name: 'performedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Respondió (humano)',
      admin: {
        position: 'sidebar',
        condition: (_, siblingData) => siblingData?.direction === 'outbound',
      },
    },
    {
      name: 'sentAt',
      type: 'date',
      label: 'Timestamp del mensaje',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
