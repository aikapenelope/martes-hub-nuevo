import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'
import { isWholeUsd } from '../lib/money'
import { validateTenantRelations } from '../lib/tenant-relations'

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
  hooks: {
    // company no puede apuntar a una empresa de otro tenant (Devin review)
    beforeChange: [validateTenantRelations([{ field: 'company', collection: 'companies' }])],
  },
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
        { label: 'Llamada Fría', value: 'llamada_fria' },
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
      name: 'website',
      type: 'text',
      label: 'Website',
    },
    {
      name: 'whatsappLink',
      type: 'text',
      label: 'Enlace de WhatsApp',
      admin: {
        description: 'Link directo wa.me/... del contacto',
      },
    },
    {
      name: 'segment',
      type: 'relationship',
      relationTo: 'segments',
      label: 'Rubro / Segmento',
    },
    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      index: true,
      label: 'Empresa (cuenta)',
      filterOptions: ({ data, siblingData }) => {
        const rawTenant = (data as { tenant?: number | { id: number } } | undefined)?.tenant
          ?? (siblingData as { tenant?: number | { id: number } } | undefined)?.tenant
        const tenantId = typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant
        return {
          ...(tenantId ? { tenant: { equals: tenantId } } : {}),
        }
      },
      admin: {
        position: 'sidebar',
        description: 'Cuenta del prospecto, si aplica; se hereda al convertir a cliente',
      },
    },
    {
      name: 'estimatedValue',
      type: 'number',
      min: 0,
      label: 'Valor estimado (USD)',
      // Mismo contrato entero que Payments/Offers/Memberships: la validación
      // vive en el campo para que aplique desde /admin, REST y Local API.
      validate: (value: number | null | undefined) =>
        value === null || value === undefined || isWholeUsd(value) ||
        'El valor estimado debe ser un número entero de USD (sin centavos)',
      admin: {
        step: 1,
        position: 'sidebar',
        description: 'Estimación de la oportunidad; alimenta el pipeline del workspace',
      },
    },
    {
      name: 'nivelInteres',
      type: 'select',
      label: 'Nivel de interés',
      options: [
        { label: '❄️ Frío', value: 'frio' },
        { label: '🌡️ Templado', value: 'templado' },
        { label: '🔥 Caliente', value: 'caliente' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'prioridad',
      type: 'select',
      label: 'Prioridad',
      options: [
        { label: 'Baja', value: 'baja' },
        { label: 'Media', value: 'media' },
        { label: '🔥 Alta', value: 'alta' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'servicioInteres',
      type: 'text',
      label: 'Servicio de interés',
    },
    {
      name: 'personaInteres',
      type: 'text',
      label: 'Persona de interés (decisor / contacto clave)',
    },
    {
      name: 'identificador',
      type: 'text',
      label: 'Identificador externo',
      admin: {
        description: 'ID de origen (p. ej. Fibery / CRM anterior) para trazabilidad de migración',
      },
    },
    {
      name: 'sectorFibery',
      type: 'text',
      label: 'Sector (Fibery)',
      admin: {
        description: 'Sector original del export de Fibery',
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
      label: 'Última llamada',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'numeroDeLlamadas',
      type: 'number',
      min: 0,
      defaultValue: 0,
      label: 'Número de llamadas',
    },
    {
      name: 'fechaProximaLlamada',
      type: 'date',
      label: 'Próxima llamada programada',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'visitadoPresencialmente',
      type: 'checkbox',
      label: '¿Visitado presencialmente?',
      defaultValue: false,
    },
    {
      name: 'pudoHablarDecisor',
      type: 'checkbox',
      label: '¿Pudo hablar con el decisor?',
      defaultValue: false,
    },
    {
      name: 'notasLlamada',
      type: 'textarea',
      label: 'Notas de llamada',
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
    {
      name: 'convertedAt',
      type: 'date',
      label: 'Fecha de conversión',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Instante de la conversión — habilita deltas de conversión por ventana real',
      },
    },
    // Relaciones inversas (skill Payload: join field — sin duplicar datos):
    // touchpoints = actividades del lead; notas y tareas ya viven en sus
    // colecciones con relación `lead`, aquí se leen en la dirección contraria.
    {
      name: 'touchpoints',
      type: 'join',
      collection: 'activities',
      on: 'lead',
      label: 'Touchpoints (actividades)',
      admin: {
        defaultColumns: ['type', 'summary', 'occurredAt', 'performedBy'],
      },
    },
    {
      name: 'contenidoRelacionado',
      type: 'join',
      collection: 'notes',
      on: 'lead',
      label: 'Notas relacionadas',
      admin: {
        defaultColumns: ['title', 'updatedAt'],
      },
    },
    {
      name: 'tareas',
      type: 'join',
      collection: 'tasks',
      on: 'lead',
      label: 'Tareas',
      admin: {
        defaultColumns: ['title', 'status', 'priority', 'dueDate'],
      },
    },
    // Joins inversos: ver todo lo vinculado al lead desde el modelo
    {
      name: 'conversations',
      type: 'join',
      collection: 'conversations',
      on: 'lead',
      label: 'Conversaciones',
    },
    {
      name: 'tasks',
      type: 'join',
      collection: 'tasks',
      on: 'lead',
      label: 'Tareas',
    },
    {
      name: 'formSubmissions',
      type: 'join',
      collection: 'form-submissions',
      on: 'lead',
      label: 'Formularios',
    },
    {
      name: 'appointments',
      type: 'join',
      collection: 'appointments',
      on: 'lead',
      label: 'Citas',
    },
  ],
}
