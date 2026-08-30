import type { CollectionConfig, Where } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Clients: CollectionConfig = {
  slug: 'clients',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'companyName', 'stage', 'city', 'assignedAgent', 'phone', 'updatedAt'],
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
        if (operation !== 'create' || req.context?.skipLeadConversion) return
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
              context: {
                ...req.context,
                skipLeadConversion: true,
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
      label: 'Nombre del cliente o Contacto principal',
    },
    {
      name: 'companyName',
      type: 'text',
      label: 'Empresa / Razón Social',
    },
    {
      name: 'taxId',
      type: 'text',
      label: 'Documento fiscal / RIF / CIF',
      admin: {
        position: 'sidebar',
      },
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
      index: true,
      label: 'Email',
    },
    {
      name: 'phone',
      type: 'text',
      index: true,
      label: 'Teléfono (WhatsApp)',
      admin: {
        description: 'Formato internacional sin +: ej 584121234567',
      },
    },
    {
      name: 'city',
      type: 'text',
      label: 'Ciudad',
    },
    {
      name: 'state',
      type: 'text',
      label: 'Estado / Región',
    },
    {
      name: 'address',
      type: 'text',
      label: 'Dirección física / Local comercial',
    },
    {
      name: 'googleMapsUrl',
      type: 'text',
      label: 'Enlace Google Maps',
    },
    {
      name: 'socialHandle',
      type: 'text',
      label: 'Usuario Red Social (IG/LinkedIn)',
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro / Segmento',
    },
    {
      name: 'lastContactChannel',
      type: 'select',
      label: 'Último canal de contacto',
      options: [
        { label: 'WhatsApp', value: 'whatsapp' },
        { label: 'Instagram DM', value: 'instagram_dm' },
        { label: 'Llamada telefónica', value: 'llamada' },
        { label: 'En persona / Visita', value: 'en_persona' },
        { label: 'Correo electrónico', value: 'email' },
        { label: 'Otro', value: 'otro' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'lastContactedAt',
      type: 'date',
      label: 'Fecha de último contacto',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'assignedAgent',
      type: 'relationship',
      relationTo: 'users',
      label: 'Agente asignado',
      filterOptions: ({ data, siblingData }) => {
        const rawTenant = (data as { tenant?: number | { id: number } } | undefined)?.tenant
          ?? (siblingData as { tenant?: number | { id: number } } | undefined)?.tenant
        const tenantId = typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant
        return {
          roles: { in: ['admin', 'agente'] },
          active: { equals: true },
          ...(tenantId ? { 'tenants.tenant': { in: [tenantId] } } : {}),
        }
      },
    },
    {
      name: 'commercialNotes',
      type: 'textarea',
      label: 'Comentarios comerciales y feedback presencial / WhatsApp',
      admin: {
        description: 'Notas de reuniones, requerimientos específicos, acuerdos y feedback del cliente.',
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
      label: 'Notas internas generales',
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
