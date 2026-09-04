import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'
import { isWholeUsd } from '../lib/money'

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
      label: 'Monto (USD entero)',
      min: 0,
      // Decisión de negocio: montos enteros (sin centavos). La validación
      // vive en el campo para que aplique desde /admin, REST y Local API.
      validate: (value: number | null | undefined) =>
        value === null || value === undefined || isWholeUsd(value) ||
        'El monto debe ser un número entero de USD (sin centavos)',
      admin: {
        step: 1,
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
