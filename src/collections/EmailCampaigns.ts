import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'
import { sendCampaignHandler } from '../endpoints/sendCampaign'

export const EmailCampaigns: CollectionConfig = {
  slug: 'email-campaigns',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'status', 'segment', 'sentCount', 'sentAt'],
    group: 'Email',
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
      label: 'Nombre interno',
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      label: 'Asunto',
    },
    {
      name: 'preheader',
      type: 'text',
      label: 'Preheader',
      admin: {
        position: 'sidebar',
        description: 'Texto de vista previa en el inbox del destinatario',
      },
    },
    {
      name: 'bodyHtml',
      type: 'textarea',
      required: true,
      label: 'Cuerpo (HTML)',
      admin: {
        description: 'HTML del cuerpo. Se envuelve automáticamente con la plantilla base de la marca.',
      },
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Audiencia (rubro)',
      admin: {
        description: 'Destinatarios = leads + clientes de ese rubro con email válido',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      label: 'Estado',
      options: ['draft', 'sending', 'sent', 'partial', 'failed'],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'scheduledAt',
      type: 'date',
      label: 'Programada para',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Informativo en v1: el envío es manual desde el botón Enviar',
      },
    },
    {
      name: 'sentAt',
      type: 'date',
      label: 'Enviada',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'sentCount',
      type: 'number',
      defaultValue: 0,
      label: 'Enviados',
      admin: { position: 'sidebar', readOnly: true, step: 1 },
    },
    {
      name: 'bouncedCount',
      type: 'number',
      defaultValue: 0,
      label: 'Rebotados',
      admin: { position: 'sidebar', readOnly: true, step: 1 },
    },
  ],
  endpoints: [
    {
      path: '/send',
      method: 'post',
      handler: sendCampaignHandler,
    },
  ],
}
