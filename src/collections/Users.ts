import { APIError, type AccessResult, type CollectionConfig, type Where } from 'payload'
import type { User } from '@/payload-types'

import { adminOnly, fieldAdminOnly } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Administración',
  },
  auth: true,
  access: {
    read: ({ req }): AccessResult => {
      const user = req.user as User | null
      if (!user) return false
      if (user.roles?.includes('admin')) return true

      const userTenants = (user.tenants || [])
        .map((t) => (typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant))
        .filter((tId): tId is number => typeof tId === 'number')

      if (userTenants.length === 0) {
        const selfWhere: Where = { id: { equals: user.id } }
        return selfWhere
      }

      const scopedWhere: Where = {
        or: [
          { id: { equals: user.id } },
          { 'tenants.tenant': { in: userTenants } },
        ],
      }
      return scopedWhere
    },
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
