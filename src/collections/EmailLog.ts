import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const EmailLog: CollectionConfig = {
  slug: 'email-log',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['to', 'subject', 'status', 'source', 'sentAt'],
    group: 'Email',
    description: 'Registro de emails enviados. Lo escribe el sistema; los eventos de Resend actualizan el estado.',
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
      name: 'to',
      type: 'email',
      required: true,
      label: 'Para',
    },
    {
      name: 'from',
      type: 'text',
      label: 'De',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      label: 'Asunto',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      label: 'Estado',
      options: [
        { label: 'En Cola', value: 'queued' },
        { label: 'Enviado', value: 'sent' },
        { label: 'Entregado', value: 'delivered' },
        { label: 'Rebotado', value: 'bounced' },
        { label: 'Queja', value: 'complained' },
        { label: 'Fallido', value: 'failed' },
      ],
      admin: {
        position: 'sidebar',
        description: 'queued→sent lo setea el envío; delivered/bounced/complained llegan por webhook de Resend',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'transactional',
      label: 'Origen',
      options: [
        { label: 'Transaccional', value: 'transactional' },
        { label: 'Campaña', value: 'campaign' },
        { label: 'Prueba', value: 'test' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'providerMessageId',
      type: 'text',
      index: true,
      label: 'ID Resend',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'email_id que devuelve la API; lo usa el webhook para actualizar el estado',
      },
    },
    {
      name: 'campaign',
      type: 'relationship',
      relationTo: 'email-campaigns',
      label: 'Campaña',
    },
    {
      name: 'error',
      type: 'textarea',
      label: 'Error',
      admin: {
        condition: (_data, siblingData) => siblingData?.status === 'failed' || siblingData?.status === 'bounced',
      },
    },
    {
      name: 'eventsJson',
      type: 'json',
      label: 'Eventos del proveedor',
    },
  ],
}
