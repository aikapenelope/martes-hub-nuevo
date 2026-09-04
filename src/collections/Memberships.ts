import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'
import { isWholeUsd } from '../lib/money'

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
      label: 'Precio mensual (USD entero)',
      min: 0,
      // Montos enteros (sin centavos) — ver src/lib/money.ts
      validate: (value: number | null | undefined) =>
        value === null || value === undefined || isWholeUsd(value) ||
        'El precio debe ser un número entero de USD (sin centavos)',
      admin: {
        step: 1,
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
