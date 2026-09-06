import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

/** Tamaño máximo de la escena serializada (JSON con elements + files). Generoso: pizarras de texto son KBs. */
export const MAX_SCENE_BYTES = 5 * 1024 * 1024
/** Tamaño máximo del thumbnail dataURL generado en el cliente. */
export const MAX_THUMBNAIL_BYTES = 512 * 1024
/** Pizarras máximas por tenant. */
export const MAX_BOARDS_PER_TENANT = 500
export const MAX_TITLE = 120

export const Whiteboards: CollectionConfig = {
  slug: 'whiteboards',
  labels: {
    singular: 'Whiteboard',
    plural: 'Whiteboards',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt', 'createdAt'],
    group: 'CRM',
    description: 'Pizarras colaborativas del tenant (Excalidraw). Compartidas por todos los agentes del workspace.',
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
      maxLength: MAX_TITLE,
      label: 'Título',
    },
    {
      name: 'scene',
      type: 'json',
      required: true,
      label: 'Escena',
      admin: {
        description: 'Escena Excalidraw: { elements: [...], files: {...} }. Guardada por el editor, no editar a mano.',
      },
      validate: (value: unknown): true | string => {
        if (!value || typeof value !== 'object' || !Array.isArray((value as { elements?: unknown }).elements)) {
          return 'La escena debe incluir un arreglo elements'
        }
        return true
      },
    },
    {
      name: 'thumbnail',
      type: 'text',
      label: 'Miniatura',
      admin: {
        description: 'Vista previa PNG (dataURL) generada en el cliente. Informativa, no se valida como imagen.',
      },
    },
    {
      name: 'source',
      type: 'select',
      label: 'Origen',
      defaultValue: 'local',
      options: [
        { label: 'Creada aquí', value: 'local' },
        { label: 'Importada', value: 'import' },
      ],
    },
  ],
}
