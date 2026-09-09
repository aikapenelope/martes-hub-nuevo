import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'
import { normalizeUploadBuffer } from '../hooks/normalize-upload-buffer'

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
    {
      name: 'purgedAt',
      type: 'date',
      label: 'Objeto original purgado (media temporal social)',
      admin: {
        description:
          'Media temporal de publicaciones sociales: el job TTL borra el objeto grande a las 48h (IG ya copió la imagen); la miniatura queda como historial.',
        hidden: true,
      },
    },
    {
      name: 'socialTemp',
      type: 'checkbox',
      defaultValue: false,
      label: 'Media temporal social',
      admin: {
        description:
          'Solo el composer de publicaciones lo marca: el job TTL SOLO purga assets marcados — nunca media general del workspace.',
        hidden: true,
      },
    },
  ],
  // Allowlist explícita (docs: /docs/upload/overview — "Restrict mimeTypes in
  // the file picker"). Los ejecutables/HTML ya vienen bloqueados por defecto,
  // pero SVG no: un SVG con <script> servido desde el mismo origen es XSS
  // almacenado, así que queda prohibido aquí Y en media-actions.ts (mismo
  // allowlist, sin SVG). No se usa `image/*` genérico para no dejarlo pasar.
  // Documentos: los mismos que acepta uploadMediaAction en el workspace
  // (PDF/txt/csv/Word/Excel — se descargan como attachment, nunca inline).
  // Video: adjuntos de publicaciones sociales.
  upload: {
    // Miniaturas: toda imagen subida genera una versión pequeña que sobrevive
    // a la purga del original (historial de publicaciones sociales — doc 01 v3).
    imageSizes: [
      {
        name: 'thumbnail',
        width: 320,
        height: 320,
        fit: 'cover',
      },
    ],
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    // Payload #13309: los Buffer del Local API rompen la detección de tipo
    // (factura→PDF→Media). Normaliza req.file.data a Uint8Array antes de
    // generateFileData.
    beforeOperation: [normalizeUploadBuffer],
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

