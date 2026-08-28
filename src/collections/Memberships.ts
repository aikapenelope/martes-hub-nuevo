import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Memberships: CollectionConfig = {
  slug: 'memberships',
  admin: {
    useAsTitle: 'plan',
    defaultColumns: ['client', 'plan', 'status', 'startDate', 'renewalDate'],
    group: 'Dinero',
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
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      required: true,
      label: 'Cliente',
    },
    {
      name: 'plan',
      type: 'text',
      required: true,
      label: 'Plan',
      admin: {
        description: 'Ej: Web básica, CRM + Redes, Mantenimiento premium',
      },
    },
    {
      name: 'monthlyPrice',
      type: 'number',
      required: true,
      label: 'Precio mensual (USD)',
      min: 0,
      admin: {
        step: 0.01,
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'activa',
      label: 'Estado',
      options: [
        { label: 'Activa', value: 'activa' },
        { label: 'Pausada', value: 'pausada' },
        { label: 'Vencida', value: 'vencida' },
        { label: 'Cancelada', value: 'cancelada' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
      label: 'Inicio',
      admin: { position: 'sidebar' },
    },
    {
      name: 'renewalDate',
      type: 'date',
      required: true,
      label: 'Próxima renovación',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
