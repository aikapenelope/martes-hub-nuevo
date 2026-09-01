import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

/**
 * ConversationNotes — notas privadas internas sobre una conversación
 * (modelo Chatwoot): contexto del agente para el equipo, nunca visibles
 * para el contacto. Una nota por "mensaje interno", ordenadas por fecha.
 */
export const ConversationNotes: CollectionConfig = {
  slug: 'conversation-notes',
  admin: {
    useAsTitle: 'body',
    defaultColumns: ['conversation', 'author', 'createdAt'],
    group: 'Mensajería',
    description: 'Notas internas del equipo sobre conversaciones (privadas, no se envían al contacto).',
  },
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        // La conversación debe pertenecer al mismo tenant que la nota —
        // sin esto una nota cruzaría el aislamiento multi-tenant (Devin Review).
        const convRaw = data.conversation
        if (convRaw != null) {
          const tenantRaw = data.tenant
          const tenantId = typeof tenantRaw === 'object' && tenantRaw ? tenantRaw.id : tenantRaw
          if (tenantId) {
            const conv = await req.payload.findByID({ collection: 'conversations', id: convRaw as number, depth: 0, overrideAccess: false, user: req.user })
            const convTenant = typeof conv.tenant === 'object' && conv.tenant ? conv.tenant.id : conv.tenant
            if (convTenant !== tenantId) throw new Error('La conversación no pertenece al tenant activo')
          }
        }
        return data
      },
    ],
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
      name: 'conversation',
      type: 'relationship',
      relationTo: 'conversations',
      required: true,
      index: true,
      label: 'Conversación',
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 4000,
      label: 'Nota interna',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      label: 'Autor',
      admin: {
        position: 'sidebar',
        description: 'Se rellena automáticamente con el usuario autenticado',
      },
    },
  ],
}
