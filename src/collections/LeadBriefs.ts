import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

/**
 * LeadBriefs — brief 360 generado por IA para un lead (Attio-style AI
 * attributes): resumen ejecutivo, señales detectadas, próxima acción
 * sugerida y mensaje de WhatsApp pre-escrito. Consultable en la ficha y
 * en la lista de prospección. Se genera on demand y por automatización
 * (cuando el lead sube a "caliente"); upsert del más reciente por lead.
 */
export const LeadBriefs: CollectionConfig = {
  slug: 'lead-briefs',
  labels: {
    singular: 'Brief de Lead',
    plural: 'Briefs de Leads',
  },
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['lead', 'sentiment', 'updatedAt'],
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
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      required: true,
      index: true,
      label: 'Lead',
    },
    {
      name: 'summary',
      type: 'textarea',
      label: 'Resumen ejecutivo',
      admin: {
        description: 'Quién es, qué quiere y por dónde va la conversación.',
      },
    },
    {
      name: 'senales',
      type: 'textarea',
      label: 'Señales detectadas',
      admin: {
        description: 'Una por línea: interés, objeciones, urgencia, cobros pendientes, etc.',
      },
    },
    {
      name: 'sentiment',
      type: 'select',
      label: 'Sentimiento',
      options: [
        { label: 'Positivo', value: 'positivo' },
        { label: 'Neutral', value: 'neutral' },
        { label: 'Negativo', value: 'negativo' },
      ],
    },
    {
      name: 'proximaAccion',
      type: 'text',
      label: 'Próxima acción sugerida',
    },
    {
      name: 'mensajeWhatsapp',
      type: 'textarea',
      label: 'Mensaje de WhatsApp sugerido',
      admin: {
        description: 'Mensaje pre-escrito y personalizado para retomar el contacto.',
      },
    },
    {
      name: 'model',
      type: 'text',
      label: 'Modelo IA',
      admin: {
        description: 'Proveedor/modelo que generó el brief (trazabilidad).',
      },
    },
  ],
}
