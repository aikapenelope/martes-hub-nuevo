import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

/**
 * Sequences de email: cadenas de pasos (email / tarea / esperar N días) que
 * nutren leads manualmente inscritos por el agente. El job dispatch-sequences
 * ejecuta un paso por pasada por inscripción y se detiene si el lead responde
 * por cualquier canal o queda descartado/convertido.
 */
export const Sequences: CollectionConfig = {
  slug: 'sequences',
  labels: {
    singular: 'Secuencia',
    plural: 'Secuencias',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'active', 'createdAt'],
    group: 'CRM',
    description: 'Cadenas de nurturing por email para leads (pasos: email, tarea, esperar N días).',
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
      label: 'Nombre de la secuencia',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Descripción',
      admin: {
        description: 'Para qué sirve esta secuencia (ej: seguimiento post-cotización).',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Activa',
      admin: {
        position: 'sidebar',
        description: 'Las inscripciones de secuencias inactivas quedan en pausa (no se cancelan).',
      },
    },
    {
      name: 'steps',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 20,
      label: 'Pasos',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          label: 'Tipo de paso',
          options: [
            { label: 'Email', value: 'email' },
            { label: 'Tarea', value: 'tarea' },
            { label: 'Esperar N días', value: 'esperar' },
          ],
        },
        {
          name: 'subject',
          type: 'text',
          maxLength: 200,
          label: 'Asunto del email',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'email',
            description: 'Soporta {{nombre}} para personalizar con el nombre del lead.',
          },
        },
        {
          name: 'bodyHtml',
          type: 'textarea',
          label: 'Cuerpo del email (HTML simple)',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'email',
            description: 'Se envuelve con la plantilla de marca. Soporta {{nombre}}.',
          },
        },
        {
          name: 'taskTitle',
          type: 'text',
          maxLength: 180,
          label: 'Título de la tarea',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'tarea',
          },
        },
        {
          name: 'taskDueInDays',
          type: 'number',
          min: 0,
          max: 90,
          defaultValue: 3,
          label: 'Vence en (días)',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'tarea',
          },
        },
        {
          name: 'days',
          type: 'number',
          min: 1,
          max: 90,
          required: true,
          label: 'Días de espera',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'esperar',
          },
        },
      ],
    },
  ],
}
