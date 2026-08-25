import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Clients: CollectionConfig = {
  slug: 'clients',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'stage', 'assignedAgent', 'phone', 'updatedAt'],
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
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'stage',
      type: 'select',
      required: true,
      defaultValue: 'activo',
      options: ['nuevo', 'activo', 'inactivo', 'perdido'],
      label: 'Etapa',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Teléfono (WhatsApp)',
      admin: {
        description: 'Formato internacional sin +: ej 584121234567',
      },
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro / Segmento',
    },
    {
      name: 'assignedAgent',
      type: 'relationship',
      relationTo: 'users',
      label: 'Agente asignado',
      filterOptions: {
        roles: { in: ['admin', 'agente'] },
        active: { equals: true },
      },
    },
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Consentimiento de contacto',
      defaultValue: false,
    },
    {
      name: 'optOutAt',
      type: 'date',
      label: 'Opt-out solicitado',
      admin: {
        position: 'sidebar',
        description: 'Si tiene fecha, no se le debe contactar',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notas internas',
    },
    {
      name: 'activities',
      type: 'join',
      collection: 'activities',
      on: 'client',
      label: 'Timeline',
    },
  ],
}
