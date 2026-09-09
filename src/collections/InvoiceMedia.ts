import type { CollectionConfig } from 'payload'
import { parseCookies, ValidationError } from 'payload'

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
 * facturación. Aquí NO hay allowlist de mimeTypes (la blocklist dura de
 * Payload — ejecutables, HTML/PHP — sigue aplicando y se testea), pero la
 * subida está acotada a PDFs por filename+mimetype declarado (hallazgo Devin
 * #113: un editor no puede convertir la colección en hosting arbitrario) y
 * los archivos se sirven como attachment (sin XSS inline).
 *
 * Tenant del archivo: SIEMPRE debe resolverse al tenant de la operación —
 * la validación de la relación generatedPdfs/attachedPdf filtra por tenant
 * (multiTenantPlugin) y un PDF en otro tenant es rechazado o, peor, legible
 * por el tenant equivocado. Orden de resolución (hallazgos Devin #113):
 * 1. req.context.tenantId — el estándar del repo en acciones user-facing.
 * 2. Cookie `payload-tenant` del admin UI (tenant activo seleccionado).
 * 3. Primer tenant del usuario autenticado.
 * Sin resolución → ValidationError explícito: nunca un PDF sin tenant
 * (antes: fallback a primer tenant global = leak potencial).
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

        const uploadFile = req.file as { name?: string; mimetype?: string } | undefined

        // Updates sin archivo (p. ej. editar alt desde admin): nada que
        // validar ni tenant que asignar.
        if (!uploadFile) return data

        // PDF-only por filename + mimetype declarado (hallazgo Devin #113):
        // el contenido no es tipable (es la condición del fix #110), así que
        // la restricción es sobre lo declarado — el plugin siempre sube
        // `*.pdf` + `application/pdf`; cualquier otra cosa por la API de la
        // colección se rechaza explícitamente.
        const fileName = uploadFile.name ?? ''
        const declaredMime = uploadFile.mimetype ?? ''
        if (!fileName.toLowerCase().endsWith('.pdf') || !declaredMime.includes('application/pdf')) {
          throw new ValidationError({
            errors: [
              {
                message: 'invoice-media solo acepta PDFs de facturación generados por el sistema.',
                path: 'file',
              },
            ],
          })
        }

        if (data.tenant) return data

        // 1. Contexto de la operación (estándar del repo en acciones).
        const contextTenantId = (req.context as { tenantId?: number } | undefined)?.tenantId
        if (Number.isInteger(contextTenantId) && (contextTenantId ?? 0) > 0) {
          data.tenant = contextTenantId
          return data
        }

        // 2. Tenant activo del admin UI (cookie payload-tenant del plugin
        // multi-tenant — misma lectura que getTenantFromCookie). Los headers
        // pueden llegar como Headers (HTTP) o registro plano (Local API).
        try {
          const cookieHeader = req.headers as unknown as Record<string, string> | undefined
          const cookieTenant = Number(parseCookies(new Headers(cookieHeader ?? {})).get('payload-tenant'))
          if (Number.isInteger(cookieTenant) && cookieTenant > 0) {
            data.tenant = cookieTenant
            return data
          }
        } catch {
          // Sin headers legibles (p. ej. Local API headless): seguir al paso 3.
        }

        // 3. Primer tenant del usuario autenticado.
        const userTenants = (req.user as { tenants?: { tenant: number | { id: number } }[] } | null | undefined)?.tenants
        const userTenantId = userTenants?.[0]?.tenant
        if (userTenantId != null) {
          data.tenant = typeof userTenantId === 'object' ? userTenantId.id : userTenantId
          return data
        }

        // Sin tenant resoluble: fallar explícito. Asignar un tenant arbitrario
        // dejaría el PDF legible por ese tenant (leak) o rechazado por la
        // validación de la relación (hallazgos Devin #113).
        throw new ValidationError({
          errors: [
            {
              message:
                'No se pudo resolver el tenant del PDF: la operación debe llevar contexto de tenant (context.tenantId), cookie de admin o un usuario con membresía.',
              path: 'tenant',
            },
          ],
        })
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
