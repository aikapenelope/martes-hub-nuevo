import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

/**
 * EmailMessages — espejo de solo lectura del buzón (Gmail), tanto recibidos
 * como enviados (label SENT). Lo escribe exclusivamente el job `sync-email`
 * con overrideAccess: el usuario no crea ni edita filas desde el admin para
 * que el espejo nunca diverja de la fuente (mismo criterio que `messages`
 * con OpenBSP). El envío real de email sigue siendo Resend y su registro
 * operativo vive en `email-log` — este espejo aporta el "qué se dijo".
 */
export const EmailMessages: CollectionConfig = {
  slug: 'email-messages',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['date', 'direction', 'fromEmail', 'toEmails', 'subject', 'client'],
    group: 'Email',
    description: 'Espejo del buzón sincronizado de Gmail. Solo lectura: lo escribe el job sync-email.',
  },
  access: {
    read: authenticated,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  timestamps: true,
  indexes: [{ fields: ['tenant', 'providerId'], unique: true }],
  fields: [
    {
      name: 'direction',
      type: 'select',
      required: true,
      label: 'Dirección',
      options: [
        { label: 'Entrante', value: 'inbound' },
        { label: 'Saliente (desde el buzón)', value: 'outbound' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'providerId',
      type: 'text',
      index: true,
      required: true,
      label: 'ID Gmail',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Idempotencia: reintentos del sync no duplican',
      },
    },
    {
      name: 'threadId',
      type: 'text',
      index: true,
      label: 'Hilo (threadId Gmail)',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'fromEmail',
      type: 'email',
      index: true,
      label: 'Remitente',
    },
    {
      name: 'fromName',
      type: 'text',
      label: 'Nombre del remitente',
      admin: { position: 'sidebar' },
    },
    {
      name: 'toEmails',
      type: 'text',
      label: 'Destinatarios',
      admin: { description: 'Lista separada por comas' },
    },
    {
      name: 'ccEmails',
      type: 'text',
      label: 'CC',
      admin: { description: 'Lista separada por comas' },
    },
    {
      name: 'subject',
      type: 'text',
      label: 'Asunto',
    },
    {
      name: 'snippet',
      type: 'textarea',
      label: 'Vista previa',
    },
    {
      name: 'date',
      type: 'date',
      required: true,
      index: true,
      label: 'Fecha del mensaje',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      index: true,
      label: 'Cliente',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Lo rellena el sync por matching del email contra clients/leads',
      },
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      index: true,
      label: 'Lead',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Lo rellena el sync por matching del email contra clients/leads',
      },
    },
  ],
}
