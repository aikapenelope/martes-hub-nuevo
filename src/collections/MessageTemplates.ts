import type { CollectionConfig } from 'payload'

import { authenticated, editorsOnly, adminOnly } from '../access'

export const MessageTemplates: CollectionConfig = {
  slug: 'message-templates',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'language', 'metaStatus', 'updatedAt'],
    group: 'Mensajería',
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
      label: 'Nombre (Meta)',
      admin: { description: 'Ej: recordatorio_pago — debe existir aprobado en Meta' },
    },
    {
      name: 'language',
      type: 'text',
      required: true,
      defaultValue: 'es',
      label: 'Idioma (código Meta)',
      admin: { position: 'sidebar' },
    },
    {
      name: 'category',
      type: 'select',
      label: 'Categoría',
      options: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'metaStatus',
      type: 'select',
      label: 'Estado en Meta',
      options: ['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'bodyText',
      type: 'textarea',
      label: 'Cuerpo',
      admin: { description: 'Con placeholders {{1}}, {{2}}…' },
    },
    {
      name: 'componentsJson',
      type: 'json',
      label: 'Components crudos',
    },
    {
      name: 'openbspTemplateId',
      type: 'text',
      index: true,
      label: 'ID en OpenBSP',
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc }) => {
        if (!data?.name || !data?.language) return data
        const rawTenant = data.tenant ?? originalDoc?.tenant
        const tenantId =
          typeof rawTenant === 'object' && rawTenant !== null ? rawTenant.id : rawTenant

        const dupes = await req.payload.find({
          collection: 'message-templates',
          where: {
            and: [
              { name: { equals: data.name as string } },
              { language: { equals: data.language as string } },
              ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const clash = dupes.docs.find((d) => d.id !== originalDoc?.id)
        if (clash) {
          throw new Error('Ya existe una plantilla con ese nombre+idioma en este tenant')
        }
        return data
      },
    ],
  },
}
