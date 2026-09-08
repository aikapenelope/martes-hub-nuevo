import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'
import {
  makeSequenceStepRequiredValidator,
  stepsChangedStructurally,
  validateSequenceStepDays,
} from '../lib/sequences'
import { sanitizeCampaignHtml } from '../email/sanitize'

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
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (!data || !Array.isArray(data.steps)) return data
        // El HTML sale bajo el dominio del tenant: se sanitiza igual que las
        // campañas, tanto al guardar como (defensa en profundidad) al enviar.
        for (const step of data.steps) {
          if (step?.type === 'email' && typeof step.bodyHtml === 'string') {
            step.bodyHtml = sanitizeCampaignHtml(step.bodyHtml)
          }
        }
        // Protege el progreso de las inscripciones (hallazgo Devin #104-5):
        // currentStep es un índice sobre este arreglo — agregar, quitar,
        // reordenar o cambiar el tipo de pasos con inscripciones activas
        // repetiría o saltaría pasos. Editar contenido (asunto, cuerpo,
        // días...) sí está permitido.
        if (operation === 'update' && originalDoc && stepsChangedStructurally(originalDoc.steps, data.steps)) {
          const active = await req.payload.count({
            collection: 'sequence-enrollments',
            where: {
              and: [
                { sequence: { equals: originalDoc.id } },
                { status: { equals: 'activa' } },
              ],
            },
            overrideAccess: true,
          })
          if (active.totalDocs > 0) {
            throw new APIError(
              'Esta secuencia tiene inscripciones activas: no se puede agregar, quitar, reordenar ni cambiar el tipo de pasos. Cancele las inscripciones activas o duplique la secuencia.',
            )
          }
        }
        return data
      },
    ],
  },
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
      admin: {
        description:
          'Con inscripciones activas no se puede cambiar la estructura (agregar/quitar/reordenar pasos); el contenido de cada paso sí es editable.',
      },
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
          validate: makeSequenceStepRequiredValidator('un asunto', ['email']),
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'email',
            description: 'Soporta {{nombre}} para personalizar con el nombre del lead.',
          },
        },
        {
          name: 'bodyHtml',
          type: 'textarea',
          maxLength: 20000,
          label: 'Cuerpo del email (HTML simple)',
          validate: makeSequenceStepRequiredValidator('un cuerpo de email', ['email']),
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'email',
            description:
              'Se envuelve con la plantilla de marca. Soporta {{nombre}}. El HTML se sanitiza al guardar (sin scripts, iframes, handlers ni javascript:) — mismo modelo que las campañas.',
          },
        },
        {
          name: 'taskTitle',
          type: 'text',
          maxLength: 180,
          label: 'Título de la tarea',
          validate: makeSequenceStepRequiredValidator('un título', ['tarea']),
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
          label: 'Días de espera',
          // Validación server-side según tipo (admin.condition solo oculta el
          // input; required fijo bloquearía pasos email/tarea — hallazgo
          // Devin #104-1).
          validate: (value: unknown, { siblingData }: { siblingData?: Record<string, unknown> }) =>
            validateSequenceStepDays(value, siblingData?.type),
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'esperar',
          },
        },
      ],
    },
  ],
}
