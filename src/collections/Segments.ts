import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const Segments: CollectionConfig = {
  slug: 'segments',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description'],
    group: 'CRM',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  timestamps: true,
  // Único compuesto por tenant (no global): dos tenants distintos deben
  // poder tener ambos un rubro llamado "Restaurantes". El `unique: true`
  // a nivel de campo (ver abajo, ya quitado) generaba un índice único
  // GLOBAL sobre `name` — el segundo tenant en crear un rubro con un
  // nombre ya usado por cualquier OTRO tenant chocaba con una violación
  // de constraint en la base de datos.
  indexes: [{ fields: ['tenant', 'name'], unique: true }],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Nombre del rubro',
    },
    {
      name: 'description',
      type: 'text',
      label: 'Descripción',
    },
  ],
}
