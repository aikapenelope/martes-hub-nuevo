import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, editorsOnly } from '../access'
import { normalizeUploadBuffer } from '../hooks/normalize-upload-buffer'

/**
 * Colección de storage interna del plugin payload-invoicepdf: aquí aterrizan
 * los PDFs de facturas y cotizaciones que el hook generate-pdf sube con un
 * Buffer del Local API.
 *
 * Por qué existe siendo separada de `media`: el `upload.mimeTypes` de media
 * activa en Payload 3.88 la detección de contenido (file-type) que se rompe
 * con buffers del Local API (issue #110 / payload#13309) y bloquea la
 * facturación. Aquí NO hay allowlist: la blocklist dura de Payload (ejecutables,
 * HTML/PHP) sigue aplicando, los archivos no-imagen se sirven como attachment
 * (sin XSS inline) y solo editores/admin crean. El resto de colecciones de
 * negocio conservan su allowlist intacta.
 */
export const InvoiceMedia: CollectionConfig = {
  slug: 'invoice-media',
  labels: {
    singular: 'PDF de facturación',
    plural: 'PDFs de facturación',
  },
  admin: {
    group: 'Invoicing',
    description: 'PDFs generados por facturas y cotizaciones. Uso interno.',
  },
  access: {
    read: authenticated,
    create: editorsOnly,
    update: editorsOnly,
    delete: adminOnly,
  },
  upload: {
    // Sin allowlist: evita checkFileRestrictions/file-type para el flujo del
    // plugin (issue #110). La blocklist de tipos restringidos de Payload
    // (ejecutables, HTML) sigue activa por defecto.
    modifyResponseHeaders: ({ headers }) => {
      headers.set('content-disposition', 'attachment')
      return headers
    },
  },
  hooks: {
    // Payload #13309: los Buffer del Local API rompen la detección de tipo.
    beforeOperation: [normalizeUploadBuffer],
    beforeValidate: [
      async ({ data, req }) => {
        if (!data) return data
        if (data.tenant) return data

        // El plugin sube sin tenant: fallback al primer tenant (mismo criterio
        // que el fallback de Media para uploads de plugins).
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
          // Si no hay tenants o falla, el validador maneja el error.
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
}
