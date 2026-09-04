import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const Conversations: CollectionConfig = {
  slug: 'conversations',
  admin: {
    useAsTitle: 'contactAddress',
    defaultColumns: ['contactAddress', 'channel', 'client', 'lastMessageAt'],
    group: 'Mensajería',
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        // Un editor no puede asignar un usuario de otro tenant (Devin Review).
        const assignee = data.assignee
        if (assignee != null) {
          const tenantRaw = data.tenant ?? (operation === 'update' ? originalDoc?.tenant : undefined)
          const tenantId = typeof tenantRaw === 'object' && tenantRaw ? tenantRaw.id : tenantRaw
          if (tenantId) {
            const user = await req.payload.findByID({ collection: 'users', id: assignee as number, depth: 0, overrideAccess: false, user: req.user })
            const isGlobalAdmin = user.roles?.includes('admin')
            const userTenants = (user.tenants ?? []).map((t) => (typeof t.tenant === 'object' ? t.tenant.id : t.tenant))
            if (!isGlobalAdmin && !userTenants.includes(tenantId as number)) {
              throw new Error('El agente no pertenece al tenant de la conversación')
            }
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
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      label: 'Estado',
      options: [
        { label: 'Abierta', value: 'open' },
        { label: 'Pendiente (esperando cliente)', value: 'pending' },
        { label: 'Resuelta', value: 'resolved' },
      ],
      admin: { position: 'sidebar' },
      index: true,
    },
    {
      name: 'priority',
      type: 'select',
      defaultValue: 'media',
      label: 'Prioridad',
      options: [
        { label: 'Baja', value: 'baja' },
        { label: 'Media', value: 'media' },
        { label: 'Alta', value: 'alta' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'assignee',
      type: 'relationship',
      relationTo: 'users',
      label: 'Agente asignado',
      admin: { position: 'sidebar' },
    },
    {
      name: 'snoozeUntil',
      type: 'date',
      label: 'Snooze hasta',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Mientras snooze activo, la conversación no aparece en abiertas',
      },
    },
    {
      name: 'labels',
      type: 'select',
      hasMany: true,
      label: 'Etiquetas',
      options: [
        { label: 'Seguimiento', value: 'seguimiento' },
        { label: 'Facturación', value: 'facturacion' },
        { label: 'Soporte', value: 'soporte' },
        { label: 'Renovación', value: 'renovacion' },
        { label: 'Urgente', value: 'urgente' },
        { label: 'Oportunidad', value: 'oportunidad' },
      ],
    },
    {
      name: 'channel',
      type: 'select',
      required: true,
      defaultValue: 'whatsapp',
      label: 'Canal',
      options: [
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Instagram DM', value: 'instagram_dm' },
        { label: 'WhatsApp Web', value: 'whatsapp_web' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'openbspId',
      type: 'text',
      index: true,
      label: 'ID OpenBSP',
      admin: {
        description: 'UUID de la conversación en OpenBSP; lo rellena el webhook',
      },
    },
    {
      name: 'organizationAddress',
      type: 'text',
      label: 'Número de negocio (phone_number_id)',
      admin: { position: 'sidebar' },
    },
    {
      name: 'contactAddress',
      type: 'text',
      required: true,
      index: true,
      label: 'Contacto (E.164 sin +)',
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead',
    },
    {
      name: 'lastMessageAt',
      type: 'date',
      label: 'Último mensaje',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastInboundAt',
      type: 'date',
      label: 'Último entrante (ventana 24h)',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Si es mayor a 24h, solo se pueden enviar plantillas',
      },
    },
  ],
}
