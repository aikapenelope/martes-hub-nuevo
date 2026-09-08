import type { CollectionConfig } from 'payload'

import { editorsOnly } from '../access'
import type { User } from '@/payload-types'

/**
 * Vistas guardadas del CRM (ítem 4, sector operacional): cada usuario guarda
 * su propio conjunto de filtros (vista, modo, estado/etapa, fuente, agente,
 * búsqueda) y los re-aplica con un clic. PRIVADAS por usuario — el acceso de
 * lectura devuelve una restricción por owner; los valores se validan contra
 * las mismas listas blancas de parseCrmFilters al construir la URL.
 */
export const SavedCrmViews: CollectionConfig = {
  slug: 'saved-crm-views',
  labels: {
    singular: 'Vista guardada',
    plural: 'Vistas guardadas del CRM',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'vista', 'createdBy', 'updatedAt'],
    group: 'CRM',
    description: 'Filtros guardados del CRM, privados por usuario.',
  },
  access: {
    // Privadas: cada usuario solo ve las suyas (constraint por owner).
    read: ({ req }) => (req.user ? { createdBy: { equals: req.user.id } } : false),
    create: editorsOnly,
    // Solo el dueño (o un admin) puede modificar una vista — editorsOnly solo
    // valida rol y permitiría a un editor sobrescribir vistas ajenas
    // (hallazgo Devin #107 SEC-1).
    update: ({ req }) => {
      const user = req.user as User | null
      if (!user) return false
      if (user.roles?.includes('admin')) return true
      return { createdBy: { equals: user.id } }
    },
    delete: ({ req }) => {
      const user = req.user as User | null
      if (!user) return false
      if (user.roles?.includes('admin')) return true
      return { createdBy: { equals: user.id } }
    },
  },
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation !== 'create') return data
        // El dueño SIEMPRE es el usuario autenticado: un editor no puede
        // forjar createdBy para adueñarse o regalar vistas (hallazgo Devin
        // #107 SEC-2).
        if (req.user) data.createdBy = req.user.id
        return data
      },
    ],
  },
  timestamps: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 60,
      label: 'Nombre de la vista',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Dueño',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'vista',
      type: 'select',
      required: true,
      label: 'Vista',
      options: [
        { label: 'Leads', value: 'leads' },
        { label: 'Clientes', value: 'clientes' },
        { label: 'Empresas', value: 'empresas' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'modo',
      type: 'select',
      defaultValue: 'pipeline',
      label: 'Modo',
      admin: { position: 'sidebar' },
      options: [
        { label: 'Pipeline', value: 'pipeline' },
        { label: 'Tabla', value: 'tabla' },
      ],
    },
    {
      name: 'q',
      type: 'text',
      maxLength: 120,
      label: 'Búsqueda',
    },
    {
      name: 'estado',
      type: 'text',
      maxLength: 20,
      label: 'Estado / Etapa',
      admin: {
        description: 'estado de lead o etapa de cliente según la vista; vacío = todos.',
      },
    },
    {
      name: 'fuente',
      type: 'text',
      maxLength: 20,
      label: 'Fuente',
    },
    {
      name: 'agente',
      type: 'text',
      maxLength: 20,
      label: 'Agente',
      admin: {
        description: "'me', 'todos' o id numérico de usuario.",
      },
    },
  ],
}
