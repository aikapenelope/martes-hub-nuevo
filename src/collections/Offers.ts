import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'
import { isWholeUsd } from '../lib/money'

export const Offers: CollectionConfig = {
  slug: 'offers',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'price', 'active'],
    group: 'CRM',
    description: 'Catálogo de productos/servicios: alimenta cotizaciones y facturas',
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
      label: 'Producto / Servicio',
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      label: 'Precio (USD entero)',
      // Montos enteros (sin centavos) — ver src/lib/money.ts. Nota: el IVA
      // del plugin invoicepdf puede generar totales con decimales; el cobro
      // derivado se redondea a entero en convertQuoteToInvoiceAction.
      validate: (value: number | null | undefined) =>
        value === null || value === undefined || isWholeUsd(value) ||
        'El precio debe ser un número entero de USD (sin centavos)',
      admin: {
        description: 'Precio base sin impuestos; el IVA se aplica al cotizar/facturar',
        step: 1,
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Descripción',
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro sugerido',
      admin: {
        position: 'sidebar',
        description: 'Para qué tipo de cliente aplica este offer',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Activo',
      admin: {
        position: 'sidebar',
        description: 'Los inactivos no se ofrecen en nuevas cotizaciones',
      },
    },
  ],
}
