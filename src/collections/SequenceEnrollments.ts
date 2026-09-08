import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'
import { validateTenantRelations } from '../lib/tenant-relations'

/**
 * Inscripción de un lead a una Sequence. El job dispatch-sequences avanza
 * currentStep cuando nextRunAt vence: un paso por pasada. Stop por respuesta
 * (inbound WhatsApp o email posterior a la inscripción), descarte o
 * conversión del lead. El índice único parcial (tenant, sequence, lead)
 * WHERE status='activa' evita inscripciones duplicadas en carrera.
 */
export const SequenceEnrollments: CollectionConfig = {
  slug: 'sequence-enrollments',
  labels: {
    singular: 'Inscripción',
    plural: 'Inscripciones a secuencias',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['sequence', 'lead', 'status', 'currentStep', 'nextRunAt'],
    group: 'CRM',
    description: 'Lo escribe el sistema y las acciones de inscripción; lectura en admin.',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  hooks: {
    // sequence/lead no pueden apuntar a registros de otro tenant (Devin review)
    beforeChange: [
      validateTenantRelations([
        { field: 'sequence', collection: 'sequences' },
        { field: 'lead', collection: 'leads' },
      ]),
    ],
  },
  fields: [
    {
      name: 'sequence',
      type: 'relationship',
      relationTo: 'sequences',
      required: true,
      index: true,
      label: 'Secuencia',
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      required: true,
      index: true,
      label: 'Lead',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'activa',
      label: 'Estado',
      admin: { position: 'sidebar' },
      options: [
        { label: 'Activa', value: 'activa' },
        { label: 'Completada', value: 'completada' },
        { label: 'Cancelada', value: 'cancelada' },
        { label: 'Respondió', value: 'respondida' },
      ],
    },
    {
      name: 'currentStep',
      type: 'number',
      defaultValue: 0,
      min: 0,
      label: 'Paso actual',
      admin: { position: 'sidebar', readOnly: true, description: 'Índice del próximo paso a procesar.' },
    },
    {
      name: 'nextRunAt',
      type: 'date',
      required: true,
      label: 'Próxima ejecución',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'enrolledBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Inscrito por',
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
