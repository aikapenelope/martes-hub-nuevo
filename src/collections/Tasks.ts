import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const Tasks: CollectionConfig = {
  slug: 'tasks',
  labels: {
    singular: 'Tarea',
    plural: 'Tareas',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'priority', 'dueDate', 'assignedTo', 'client', 'lead'],
    group: 'CRM',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (data.status === 'completada' && originalDoc?.status !== 'completada') {
          data.completedAt = new Date().toISOString()
        } else if (data.status && data.status !== 'completada' && originalDoc?.status === 'completada') {
          data.completedAt = null
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Título de la tarea',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Descripción / Instrucciones',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      label: 'Estado',
      options: [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'En Progreso', value: 'en_progreso' },
        { label: 'Completada', value: 'completada' },
        { label: 'Bloqueada', value: 'bloqueada' },
        { label: 'Cancelada', value: 'cancelada' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'priority',
      type: 'select',
      required: true,
      defaultValue: 'media',
      label: 'Prioridad',
      options: [
        { label: 'Baja', value: 'baja' },
        { label: 'Media', value: 'media' },
        { label: 'Alta', value: 'alta' },
        { label: 'Urgente', value: 'urgente' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'dueDate',
      type: 'date',
      label: 'Fecha límite',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'assignedTo',
      type: 'relationship',
      relationTo: 'users',
      label: 'Asignado a',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente relacionado',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead relacionado',
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      label: 'Origen',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Queja Tally', value: 'tally_complaint' },
        { label: 'Cobro Vencido', value: 'payment_overdue' },
        { label: 'Error OpenBSP', value: 'openbsp_error' },
        { label: 'Hermes AI', value: 'hermes_ai' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'checklist',
      type: 'array',
      label: 'Checklist de subtareas',
      fields: [
        {
          name: 'item',
          type: 'text',
          required: true,
          label: 'Elemento',
        },
        {
          name: 'done',
          type: 'checkbox',
          defaultValue: false,
          label: 'Completado',
        },
      ],
    },
    {
      name: 'completedAt',
      type: 'date',
      label: 'Fecha completada',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
