import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Valida que las relaciones de un documento pertenezcan al mismo tenant que
 * el documento. `filterOptions` solo acota el picker del admin: por REST,
 * GraphQL o MCP un editor puede mandar cualquier ID — este hook es la barrera
 * real (mismo criterio que el hook de asignado en Conversations.ts).
 *
 * Reglas (Devin/Graphify review):
 * - Un valor `null` explícito (limpiar la relación) siempre se permite.
 * - En un update que CAMBIA el tenant, la relación heredada del doc original
 *   también se revalida, aunque no venga en `data` — si no, el registro
 *   movido conservaría un vínculo de su tenant anterior.
 * - Si hay valor de relación pero no hay tenant resoluble, se rechaza el
 *   write (fail-closed): sin tenant no hay contra qué comparar.
 * - Los writes del sistema con matching mismo-tenant (backfill, sync-email,
 *   campañas) pasan por diseño.
 */
export function validateTenantRelations(
  relations: { field: string; collection: string }[],
): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, req }) => {
    if (!data) return data

    const tenantRaw = data.tenant ?? (operation === 'update' ? originalDoc?.tenant : undefined)
    const tenantId = typeof tenantRaw === 'object' && tenantRaw ? tenantRaw.id : tenantRaw

    const original = originalDoc as Record<string, unknown> | undefined
    const originalTenantRaw = originalDoc?.tenant
    const originalTenantId =
      typeof originalTenantRaw === 'object' && originalTenantRaw ? originalTenantRaw.id : originalTenantRaw
    const tenantChanged = operation === 'update' && tenantId != null && originalTenantId != null && tenantId !== originalTenantId

    for (const { field, collection } of relations) {
      const raw = data[field] ?? (tenantChanged ? original?.[field] : undefined)
      if (raw == null) continue
      const relId = typeof raw === 'object' && raw !== null ? raw.id : raw

      if (tenantId == null) {
        throw new Error(
          `No se puede asignar ${field} sin tenant del registro (aislamiento multi-tenant)`,
        )
      }

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
