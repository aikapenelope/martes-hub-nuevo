import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const FormSubmissions: CollectionConfig = {
  slug: 'form-submissions',
  labels: {
    singular: 'Envío de formulario',
    plural: 'Envíos de formularios',
  },
  admin: {
    useAsTitle: 'formName',
    defaultColumns: ['formName', 'respondentEmail', 'lead', 'client', 'isComplaint', 'createdAt'],
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
      name: 'formName',
      type: 'text',
      required: true,
      label: 'Nombre del formulario',
    },
    {
      name: 'formId',
      type: 'text',
      index: true,
      label: 'ID de formulario externo',
      admin: {
        position: 'sidebar',
        description: 'Tally form_id o ID de la plataforma',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'tally',
      label: 'Plataforma de origen',
      options: [
        { label: 'Tally', value: 'tally' },
        { label: 'Typeform', value: 'typeform' },
        { label: 'Web', value: 'web' },
        { label: 'Otro', value: 'otro' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'respondentName',
      type: 'text',
      label: 'Nombre del remitente',
    },
    {
      name: 'respondentEmail',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'respondentPhone',
      type: 'text',
      label: 'Teléfono',
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente asociado',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead asociado',
    },
    {
      name: 'isComplaint',
      type: 'checkbox',
      defaultValue: false,
      label: 'Alerta / Queja',
      admin: {
        position: 'sidebar',
        description: 'Marcado si la respuesta contiene queja o bajo NPS',
      },
    },
    {
      name: 'answersJson',
      type: 'json',
      label: 'Respuestas parseadas',
    },
    {
      name: 'rawPayload',
      type: 'json',
      label: 'Payload crudo del webhook',
    },
  ],
}
