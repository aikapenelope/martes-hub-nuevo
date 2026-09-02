import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Valida que las relaciones de un documento pertenezcan al mismo tenant que
 * el documento. `filterOptions` solo acota el picker del admin: por REST,
 * GraphQL o MCP un editor puede mandar cualquier ID — este hook es la barrera
 * real (mismo criterio que el hook de asignado en Conversations.ts).
 *
 * Se salta cuando el valor no cambia en la operación (data parcial de update)
 * o cuando el documento aún no tiene tenant resuelto; el plugin multi-tenant
 * ya exige el tenant del registro. Los writes del sistema con matching
 * mismo-tenant (backfill, sync-email, campañas) pasan por diseño.
 */
export function validateTenantRelations(
  relations: { field: string; collection: string }[],
): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    if (!data) return data

    const tenantRaw = data.tenant ?? (operation === 'update' ? originalDoc?.tenant : undefined)
    const tenantId = typeof tenantRaw === 'object' && tenantRaw ? tenantRaw.id : tenantRaw
    if (!tenantId) return data

    for (const { field, collection } of relations) {
      const raw = data[field]
      if (raw == null) continue
      const relId = typeof raw === 'object' && raw !== null ? raw.id : raw

      const rel = (await req.payload.findByID({
        collection: collection as never,
        id: relId as never,
        depth: 0,
        overrideAccess: true,
      })) as { tenant?: number | { id: number } | null } | null
      const relTenantRaw = rel?.tenant
      const relTenantId = typeof relTenantRaw === 'object' && relTenantRaw ? relTenantRaw.id : relTenantRaw
      if (relTenantId !== tenantId) {
        throw new Error(
          `El ${collection} #${String(relId)} no pertenece al tenant del registro (aislamiento multi-tenant)`,
        )
      }
    }

    return data
  }
}
