import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Segments: CollectionConfig = {
  slug: 'segments',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description'],
    group: 'CRM',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  // Único compuesto por tenant (no global): dos tenants distintos deben
  // poder tener ambos un rubro llamado "Restaurantes".
  indexes: [{ fields: ['tenant', 'name'], unique: true }],
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc }) => {
        if (!data?.name) return data
        const rawTenant = data.tenant ?? originalDoc?.tenant
        const tenantId =
          typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant

        const dupes = await req.payload.find({
          collection: 'segments',
          where: {
            and: [
              { name: { equals: data.name as string } },
              ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const clash = dupes.docs.find((d) => d.id !== originalDoc?.id)
        if (clash) {
          throw new Error('Ya existe un rubro con ese nombre en este tenant')
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nombre del rubro',
    },
    {
      name: 'description',
      type: 'text',
      label: 'Descripción',
    },
  ],
}
