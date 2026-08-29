import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const ConversationSummaries: CollectionConfig = {
  slug: 'conversation-summaries',
  labels: {
    singular: 'Resumen de conversación',
    plural: 'Resúmenes de conversaciones',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'client', 'lead', 'sentiment', 'generatedBy', 'createdAt'],
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
      name: 'title',
      type: 'text',
      required: true,
      label: 'Título / Asunto del resumen',
    },
    {
      name: 'conversation',
      type: 'relationship',
      relationTo: 'conversations',
      label: 'Conversación asociada',
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente asociado',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead asociado',
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
      label: 'Resumen ejecutivo de la interacción',
    },
    {
      name: 'sentiment',
      type: 'select',
      required: true,
      defaultValue: 'neutral',
      label: 'Sentimiento detectado',
      options: [
        { label: 'Positivo', value: 'positivo' },
        { label: 'Neutral', value: 'neutral' },
        { label: 'Negativo', value: 'negativo' },
        { label: 'En Riesgo', value: 'en_riesgo' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'objections',
      type: 'text',
      label: 'Objeciones detectadas',
      admin: {
        description: 'Precio, tiempos de entrega, dudas técnicas, etc.',
      },
    },
    {
      name: 'nextSteps',
      type: 'text',
      label: 'Próximos pasos acordados',
    },
    {
      name: 'budgetExpectation',
      type: 'text',
      label: 'Expectativa presupuestaria',
    },
    {
      name: 'keyTopics',
      type: 'array',
      label: 'Temas clave tratados',
      fields: [
        {
          name: 'topic',
          type: 'text',
          required: true,
          label: 'Tema',
        },
      ],
    },
    {
      name: 'generatedBy',
      type: 'select',
      defaultValue: 'hermes_ai',
      label: 'Generado por',
      options: [
        { label: 'IA (resumen automático)', value: 'hermes_ai' },
        { label: 'Agente OpenBSP', value: 'openbsp_agent' },
        { label: 'Manual', value: 'manual' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'rawAiResponse',
      type: 'json',
      label: 'Metadatos / Respuesta IA',
    },
  ],
}
