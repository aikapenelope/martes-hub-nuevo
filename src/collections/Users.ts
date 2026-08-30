import { APIError, type CollectionConfig } from 'payload'

import { adminOnly, authenticated, fieldAdminOnly } from '../access'

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
      return Boolean('roles' in req.user && req.user.roles?.includes('admin'))
    },
    delete: adminOnly,
    admin: ({ req }) => Boolean(req.user && 'roles' in req.user && (req.user.roles?.includes('admin') || req.user.roles?.includes('agente'))),
  },
  hooks: {
    afterLogin: [
      ({ user }) => {
        if (user.active === false) {
          throw new APIError('Tu cuenta ha sido desactivada. Contacta a un administrador.', 403)
        }
        return user
      },
    ],
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
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Agente', value: 'agente' },
        { label: 'Viewer', value: 'viewer' },
      ],
      saveToJWT: true,
      access: {
        update: ({ req }) => Boolean(req.user && 'roles' in req.user && req.user.roles?.includes('admin')),
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
      access: {
        update: fieldAdminOnly,
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
