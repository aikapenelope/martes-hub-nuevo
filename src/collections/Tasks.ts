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
      options: ['pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada'],
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
      options: ['baja', 'media', 'alta', 'urgente'],
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
        'manual',
        'tally_complaint',
        'payment_overdue',
        'openbsp_error',
        'hermes_ai',
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
