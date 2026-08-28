import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Payments: CollectionConfig = {
  slug: 'payments',
  admin: {
    useAsTitle: 'concept',
    defaultColumns: ['client', 'amount', 'dueDate', 'status', 'method'],
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
      name: 'amount',
      type: 'number',
      required: true,
      label: 'Monto (USD)',
      min: 0,
      admin: {
        step: 0.01,
        position: 'sidebar',
      },
    },
    {
      name: 'concept',
      type: 'text',
      label: 'Concepto',
      admin: {
        description: 'Ej: Mensualidad web julio, Mantenimiento CRM',
      },
    },
    {
      name: 'dueDate',
      type: 'date',
      required: true,
      label: 'Vencimiento',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pendiente',
      label: 'Estado',
      options: [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Pagado', value: 'pagado' },
        { label: 'Vencido', value: 'vencido' },
        { label: 'Anulado', value: 'anulado' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'method',
      type: 'select',
      label: 'Método de pago',
      options: [
        { label: 'Pago Móvil', value: 'pago_movil' },
        { label: 'Transferencia', value: 'transferencia' },
        { label: 'Zelle', value: 'zelle' },
        { label: 'Binance', value: 'binance' },
        { label: 'Efectivo', value: 'efectivo' },
        { label: 'Otro', value: 'otro' },
      ],
    },
    {
      name: 'paidAt',
      type: 'date',
      label: 'Fecha de pago',
      admin: {
        position: 'sidebar',
        condition: (_, siblingData) => siblingData?.status === 'pagado',
      },
    },
    {
      name: 'reminderSentAt',
      type: 'date',
      label: 'Recordatorio enviado',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Lo actualiza el job payment-reminders',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
