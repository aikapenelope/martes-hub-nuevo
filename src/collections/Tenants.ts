import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: authenticated,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nombre de la empresa',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      label: 'Slug',
      admin: {
        description: 'Identificador estable; no cambiar después de crear datos',
      },
    },
    {
      name: 'openbspOrganizationId',
      type: 'text',
      index: true,
      label: 'OpenBSP Organization ID',
      admin: {
        description: 'UUID de la organización en la instancia hosted de OpenBSP',
      },
    },
    {
      name: 'openbspPhoneNumberId',
      type: 'text',
      label: 'OpenBSP Phone Number ID',
      admin: {
        description: 'organization_address para enviar mensajes (Meta phone_number_id)',
      },
    },
  ],
}
