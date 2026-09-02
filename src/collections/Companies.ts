import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

/**
 * Companies — cuenta/empresa separada del contacto. En `clients` el campo
 * `name` sigue siendo el contacto principal; ahora una empresa puede tener
 * varios clientes (contactos) agrupados vía la relación `company`.
 * El join inverso `clients` expone los contactos en la ficha de la empresa.
 */
export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'taxId', 'segment', 'city', 'updatedAt'],
    group: 'CRM',
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
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nombre de la empresa',
    },
    {
      name: 'taxId',
      type: 'text',
      index: true,
      label: 'Documento fiscal / RIF / CIF',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'website',
      type: 'text',
      label: 'Sitio web',
    },
    {
      name: 'email',
      type: 'email',
      index: true,
      label: 'Email general',
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
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'commercialNotes',
      type: 'textarea',
      label: 'Comentarios comerciales de la cuenta',
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notas internas generales',
    },
    {
      name: 'clients',
      type: 'join',
      collection: 'clients',
      on: 'company',
      label: 'Contactos del cliente',
    },
  ],
}
