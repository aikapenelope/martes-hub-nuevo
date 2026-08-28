import type { CollectionConfig, Where } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Clients: CollectionConfig = {
  slug: 'clients',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'stage', 'assignedAgent', 'phone', 'updatedAt'],
    group: 'CRM',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  hooks: {
    afterChange: [
      async ({ doc, req, operation }) => {
        if (operation !== 'create') return
        const rawTenant = doc.tenant
        const tenantId =
          typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant

        const matchOr: Where[] = []
        if (doc.phone) matchOr.push({ phone: { equals: doc.phone } })
        if (doc.email) matchOr.push({ email: { equals: doc.email } })
        if (matchOr.length === 0) return

        const andClauses: Where[] = [
          { convertedClient: { exists: false } },
          { or: matchOr },
        ]
        if (tenantId) {
          andClauses.unshift({ tenant: { equals: tenantId } })
        }

        try {
          const matchingLeads = await req.payload.find({
            collection: 'leads',
            where: { and: andClauses },
            limit: 10,
            depth: 0,
            overrideAccess: true,
            req,
          })

          for (const lead of matchingLeads.docs) {
            await req.payload.update({
              collection: 'leads',
              id: lead.id,
              data: {
                status: 'calificado',
                convertedClient: doc.id,
              },
              overrideAccess: true,
              req,
            })
          }
        } catch {
          // Ignorar si falla la sincronización secundaria del lead
        }
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'stage',
      type: 'select',
      required: true,
      defaultValue: 'activo',
      options: [
        { label: 'Nuevo', value: 'nuevo' },
        { label: 'Activo', value: 'activo' },
        { label: 'Inactivo', value: 'inactivo' },
        { label: 'Perdido', value: 'perdido' },
      ],
      label: 'Etapa',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Teléfono (WhatsApp)',
      admin: {
        description: 'Formato internacional sin +: ej 584121234567',
      },
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro / Segmento',
    },
    {
      name: 'assignedAgent',
      type: 'relationship',
      relationTo: 'users',
      label: 'Agente asignado',
      filterOptions: {
        roles: { in: ['admin', 'agente'] },
        active: { equals: true },
      },
    },
    {
      name: 'consent',
      type: 'checkbox',
      label: 'Consentimiento de contacto',
      defaultValue: false,
    },
    {
      name: 'optOutAt',
      type: 'date',
      label: 'Opt-out solicitado',
      admin: {
        position: 'sidebar',
        description: 'Si tiene fecha, no se le debe contactar',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notas internas',
    },
    {
      name: 'activities',
      type: 'join',
      collection: 'activities',
      on: 'client',
      label: 'Timeline',
    },
  ],
}
