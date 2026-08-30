import { APIError, type CollectionConfig, type Where } from 'payload'

import { adminOnly, fieldAdminOnly } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Administración',
  },
  auth: true,
  access: {
    // Antes: cualquier usuario autenticado veía el directorio COMPLETO de
    // usuarios de TODOS los tenants (nombre, email, roles) — `users` no
    // está en el plugin multi-tenant, así que `authenticated` a secas no
    // filtraba nada. Ahora: admins ven todo; el resto solo ve usuarios
    // que comparten al menos un tenant (constraint-based access — ver
    // QUERIES.md: una Access function puede devolver un Where en vez de
    // boolean para acotar la lista).
    read: ({ req }) => {
      if (!req.user) return false
      if ('roles' in req.user && req.user.roles?.includes('admin')) return true
      const tenantIds = (('tenants' in req.user && req.user.tenants) || [])
        .map((t) => (typeof t.tenant === 'object' && t.tenant !== null ? t.tenant.id : t.tenant))
        .filter((id): id is number => typeof id === 'number')
      // El `or` con el propio id es a propósito: un usuario sin tenant
      // asignado todavía (p. ej. recién creado, antes de onboarding) no
      // debe perder la capacidad de leer su propio registro (/me, admin UI)
      // solo porque `tenantIds` está vacío.
      const orConditions: Where[] = [{ id: { equals: req.user.id } }, { 'tenants.tenant': { in: tenantIds } }]
      return { or: orConditions }
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
    // beforeLogin (no afterLogin: el login ya se completó para ese punto)
    // rechaza el intento antes de emitir sesión/JWT. Antes, el checkbox
    // `active` era puramente cosmético: desactivar a alguien no le impedía
    // seguir usando el sistema con su sesión/credenciales existentes.
    beforeLogin: [
      ({ user }) => {
        if (user.active === false) {
          throw new APIError('Esta cuenta está desactivada. Contacta a un administrador.', 403)
        }
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
        // Antes cualquiera podía reactivarse a sí mismo (el `update` general
        // de la colección permite self-update sin restringir este campo).
        // fieldAdminOnly ya existe en access/index.ts — reusado en vez de
        // reimplementar el mismo check inline.
        update: fieldAdminOnly,
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
}

