import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

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
      label: 'Precio (USD)',
      admin: {
        description: 'Precio base sin impuestos; el IVA se aplica al cotizar/facturar',
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
