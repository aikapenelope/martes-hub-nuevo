import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

const AGENT_ROLES = ['admin', 'agente']

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'status', 'source', 'segment', 'city', 'createdAt'],
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
      name: 'fullName',
      type: 'text',
      required: true,
      label: 'Nombre completo o Contacto',
    },
    {
      name: 'companyName',
      type: 'text',
      label: 'Empresa / Negocio',
    },
    {
      name: 'position',
      type: 'text',
      label: 'Cargo / Rol',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'nuevo',
      label: 'Pipeline',
      options: [
        { label: 'Nuevo', value: 'nuevo' },
        { label: 'Contactado', value: 'contactado' },
        { label: 'Calificado', value: 'calificado' },
        { label: 'Descartado', value: 'descartado' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      label: 'Origen / Canal de captación',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Google Maps / Local', value: 'google_maps' },
        { label: 'Puerta Fría / En Persona', value: 'puerta_fria' },
        { label: 'WhatsApp Directo', value: 'whatsapp' },
        { label: 'Instagram DM', value: 'instagram_dm' },
        { label: 'LinkedIn', value: 'linkedin' },
        { label: 'Formulario Web / Tally', value: 'tally' },
        { label: 'Apify Scraper', value: 'apify' },
        { label: 'Referido', value: 'referido' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'phone',
      type: 'text',
      index: true,
      label: 'Teléfono (WhatsApp)',
    },
    {
      name: 'email',
      type: 'email',
      index: true,
      label: 'Correo Electrónico',
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
      label: 'Dirección física',
    },
    {
      name: 'googleMapsUrl',
      type: 'text',
      label: 'Enlace Google Maps',
      admin: {
        description: 'URL de la ficha del negocio en Google Maps',
      },
    },
    {
      name: 'socialHandle',
      type: 'text',
      label: 'Usuario de Red Social (IG/LinkedIn)',
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro / Segmento',
    },
    {
      name: 'estimatedValue',
      type: 'number',
      min: 0,
      label: 'Valor estimado (USD)',
      admin: {
        position: 'sidebar',
        description: 'Estimación de la oportunidad; alimenta el pipeline del workspace',
      },
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
      name: 'assignedTo',
      type: 'relationship',
      relationTo: 'users',
      label: 'Agente asignado',
      filterOptions: ({ data, siblingData }) => {
        const rawTenant = (data as { tenant?: number | { id: number } } | undefined)?.tenant
          ?? (siblingData as { tenant?: number | { id: number } } | undefined)?.tenant
        const tenantId = typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant
        return {
          roles: { in: AGENT_ROLES },
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
      label: 'Comentarios comerciales y feedback presencial / WhatsApp',
      admin: {
        description: 'Notas de reuniones, objeciones expresadas, acuerdos verbales y contexto comercial clave.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notas internas generales',
    },
    {
      name: 'convertedClient',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Convertido a cliente',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Se llena automáticamente al convertir el lead',
      },
    },
  ],
}
