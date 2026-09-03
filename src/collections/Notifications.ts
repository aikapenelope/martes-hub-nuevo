import type { CollectionConfig, Where } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['read', 'severity', 'title', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: authenticated,
    create: () => false,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'body',
      type: 'textarea',
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      defaultValue: 'info',
      label: 'Severidad',
      options: [
        { label: 'Información', value: 'info' },
        { label: 'Advertencia', value: 'warning' },
        { label: 'Error', value: 'error' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'source',
      type: 'text',
      label: 'Origen',
      admin: {
        position: 'sidebar',
        description: 'openbsp / jobs / formularios…',
      },
    },
    {
      name: 'occurredAt',
      type: 'date',
      label: 'Ocurrencia',
      admin: {
        position: 'sidebar',
        description:
          'Momento real del incidente según la fuente (p. ej. created_at del log de OpenBSP). Vacío = momento de creación de la notificación.',
      },
    },
    {
      name: 'read',
      type: 'checkbox',
      defaultValue: false,
      label: 'Leída',
      admin: { position: 'sidebar' },
    },
  ],
  endpoints: [
    {
      path: '/mark-read',
      method: 'patch',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'No autenticado' }, { status: 401 })
        }
        let body: { ids?: number[]; all?: boolean; tenantId?: number } = {}
        if (typeof req.json === 'function') {
          try {
            body = (await req.json.call(req)) as typeof body
          } catch {
            body = {}
          }
        }

        let whereClause: Where = { read: { equals: false } }
        if (body.ids && body.ids.length > 0) {
          whereClause = { id: { in: body.ids } }
        } else if (body.tenantId) {
          whereClause = {
            and: [
              { tenant: { equals: body.tenantId } },
              { read: { equals: false } },
            ],
          }
        }

        const unread = await req.payload.find({
          collection: 'notifications',
          where: whereClause,
          limit: 100,
          depth: 0,
          overrideAccess: false,
          user: req.user,
          req,
        })

        for (const notif of unread.docs) {
          await req.payload.update({
            collection: 'notifications',
            id: notif.id,
            data: { read: true },
            overrideAccess: false,
            user: req.user,
            req,
          })
        }

        return Response.json({ ok: true, markedCount: unread.docs.length })
      },
    },
  ],
}
