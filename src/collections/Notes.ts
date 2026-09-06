import type { CollectionConfig } from 'payload'
import {
  BlockquoteFeature,
  BoldFeature,
  ChecklistFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  UnderlineFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const NOTE_CATEGORIES = [
  'general',
  'cliente',
  'reunion',
  'seguimiento',
  'idea',
  'recordatorio',
] as const

export type NoteCategory = (typeof NOTE_CATEGORIES)[number]

export const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  general: 'General',
  cliente: 'Cliente',
  reunion: 'Reunión',
  seguimiento: 'Seguimiento',
  idea: 'Idea',
  recordatorio: 'Recordatorio',
}

/**
 * Notes — notas enriquecidas del equipo (cuerpo Lexical: títulos, listas,
 * checklist, citas, links). Independientes o vinculadas a un cliente/lead.
 * Multi-tenant vía plugin; el autor se rellena automáticamente.
 */
export const Notes: CollectionConfig = {
  slug: 'notes',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'pinned', 'client', 'createdAt'],
    group: 'CRM',
    description: 'Notas enriquecidas del equipo (editor de texto rico, independientes o por cliente/lead).',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && !data.author && req.user) {
          data.author = req.user.id
        }
        return data
      },
    ],
  },
  timestamps: true,
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 120,
      label: 'Título',
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      label: 'Contenido',
      editor: lexicalEditor({
        features: [
          BoldFeature(),
          ItalicFeature(),
          UnderlineFeature(),
          InlineCodeFeature(),
          LinkFeature(),
          HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
          BlockquoteFeature(),
          OrderedListFeature(),
          UnorderedListFeature(),
          ChecklistFeature(),
          HorizontalRuleFeature(),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
    {
      name: 'category',
      type: 'select',
      label: 'Categoría',
      defaultValue: 'general',
      options: NOTE_CATEGORIES.map((value) => ({ value, label: NOTE_CATEGORY_LABEL[value] })),
    },
    {
      name: 'pinned',
      type: 'checkbox',
      label: 'Fijada',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Las notas fijadas aparecen primero en /workspace/notes',
      },
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      label: 'Cliente asociado',
      admin: {
        position: 'sidebar',
        description: 'Opcional: vincula la nota a un cliente del CRM',
      },
    },
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead asociado',
      admin: {
        position: 'sidebar',
        description: 'Opcional: vincula la nota a un lead del pipeline',
      },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      label: 'Autor',
      admin: {
        position: 'sidebar',
        description: 'Se rellena automáticamente con el usuario autenticado',
      },
    },
  ],
}

