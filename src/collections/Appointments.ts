import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

/**
 * Appointments — espejo de solo lectura del calendario de citas (Google
 * Calendar, job `sync-gcal`, idempotente por gcalEventId). La creación real
 * de citas vive en el agente de OpenBSP: el CRM solo consume la data para
 * que la agenda y las fichas muestren las reuniones. El usuario no crea ni
 * edita filas desde el admin (fuente de verdad: el calendario).
 */
export const Appointments: CollectionConfig = {
  slug: 'appointments',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['start', 'title', 'status', 'client', 'calendarId'],
    group: 'CRM',
    description: 'Citas espejadas de Google Calendar. Solo lectura: las escribe el job sync-gcal.',
  },
  access: {
    read: authenticated,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Título',
    },
    {
      name: 'start',
      type: 'date',
      required: true,
      index: true,
      label: 'Inicio',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'endDate',
      type: 'date',
      label: 'Fin',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'allDay',
      type: 'checkbox',
      defaultValue: false,
      label: 'Todo el día',
      admin: { position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'confirmed',
      label: 'Estado',
      options: [
        { label: 'Confirmada', value: 'confirmed' },
        { label: 'Tentativa', value: 'tentative' },
        { label: 'Cancelada', value: 'cancelled' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'location',
      type: 'text',
      label: 'Lugar',
    },
    {
      name: 'attendees',
      type: 'text',
      label: 'Asistentes',
      admin: { description: 'Emails separados por comas' },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Descripción',
    },
    {
      name: 'gcalEventId',
      type: 'text',
      index: true,
      required: true,
      label: 'ID evento GCal',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Idempotencia: reintentos del sync no duplican',
      },
    },
    {
      name: 'calendarId',
      type: 'text',
      label: 'Calendario origen',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'htmlLink',
      type: 'text',
      label: 'Enlace al evento',
      admin: { description: 'Link directo a Google Calendar' },
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
        description: 'Lo rellena el sync por matching de asistentes contra clients/leads',
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
        description: 'Lo rellena el sync por matching de asistentes contra clients/leads',
      },
    },
  ],
}
