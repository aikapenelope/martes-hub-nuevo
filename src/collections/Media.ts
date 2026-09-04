import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  // Allowlist explícita (docs: /docs/upload/overview — "Restrict mimeTypes in
  // the file picker"). Los ejecutables/HTML ya vienen bloqueados por defecto,
  // pero SVG no: un SVG con <script> servido desde el mismo origen es XSS
  // almacenado. No se usa `image/*` genérico para no dejarlo pasar.
  // PDF: los sube payload-invoicepdf · video: adjuntos de publicaciones sociales.
  upload: {
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'video/mp4',
      'video/webm',
    ],
    // Los archivos que no son imagen (PDF/video) se descargan en vez de
    // renderizarse inline: niega cualquier vía de XSS por contenido subido.
    modifyResponseHeaders: ({ headers }) => {
      const contentType = headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        headers.set('content-disposition', 'attachment')
      }
      return headers
    },
  },
  hooks: {
    beforeValidate: [
      async ({ data, req }) => {
        if (!data) return data
        if (data.tenant) return data

        // 1. Context tenant (proveniente de Server Actions o tareas de fondo)
        const ctxTenant = req?.context?.tenantId ?? req?.context?.tenant
        if (ctxTenant) {
          data.tenant = typeof ctxTenant === 'object' && 'id' in ctxTenant ? (ctxTenant as { id: number }).id : ctxTenant
          return data
        }

        // 2. Tenant de operación encadenada (ej. payload.create de cotización o factura)
        if (req?.data && typeof req.data === 'object' && 'tenant' in req.data && req.data.tenant) {
          const dTenant = req.data.tenant
          data.tenant = typeof dTenant === 'object' && 'id' in dTenant ? (dTenant as { id: number }).id : dTenant
          return data
        }

        // 3. Tenant del usuario autenticado
        const userTenants =
          req?.user && 'tenants' in req.user && Array.isArray(req.user.tenants) ? req.user.tenants : []
        if (userTenants.length > 0) {
          const firstT = userTenants[0]?.tenant
          if (firstT) {
            data.tenant = typeof firstT === 'object' && 'id' in firstT ? (firstT as { id: number }).id : firstT
            return data
          }
        }

        // 4. Fallback seguro para plugins como payload-invoicepdf que suben PDFs
        // sin inyectar el tenant field requerido por el multiTenantPlugin
        try {
          const defaultTenant = await req.payload.find({
            collection: 'tenants',
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (defaultTenant.docs.length > 0) {
            data.tenant = defaultTenant.docs[0].id
          }
        } catch {
          // Si no hay tenants o falla, el validador maneja el error
        }

        return data
      },
    ],
  },
}

