import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Administración',
  },
  auth: true,
  access: {
    read: authenticated,
    create: adminOnly,
    update: ({ req, id }) => {
      if (!req.user) return false
      if (req.user.id === id) return true
      return Boolean(req.user.roles?.includes('admin'))
    },
    delete: adminOnly,
    admin: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'firstName',
      type: 'text',
      localized: false,
    },
    {
      name: 'lastName',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['agente'],
      options: ['admin', 'agente', 'viewer'],
      saveToJWT: true,
      access: {
        update: ({ req }) => Boolean(req.user?.roles?.includes('admin')),
      },
      admin: {
        position: 'sidebar',
        description: 'admin gestiona todo · agente opera CRM · viewer solo lectura',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Activo',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
