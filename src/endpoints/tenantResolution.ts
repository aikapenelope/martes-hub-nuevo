import type { PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

/**
 * Resuelve el tenantId para un usuario autenticado:
 * 1. Si se solicita ?tenant=ID explícito y el usuario es admin o pertenece a él.
 * 2. Primer tenant al que pertenece el usuario.
 * 3. Si es super-admin, fallback al primer tenant existente.
 */
export async function resolveUserTenantId(
  req: PayloadRequest,
  fallbackUrl: string = 'http://local.payload',
): Promise<number | null> {
  const user = req.user as User | null
  if (!user) return null

  const userTenants = (user.tenants || [])
    .map((t) => (typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant))
    .filter((id): id is number => typeof id === 'number')

  const url = new URL(req.url ?? fallbackUrl)
  const qTenant = url.searchParams.get('tenant')
  const parsedTenantId = qTenant && Number.isInteger(Number(qTenant)) ? Number(qTenant) : null

  if (parsedTenantId && (user.roles?.includes('admin') || userTenants.includes(parsedTenantId))) {
    return parsedTenantId
  }

  if (userTenants.length > 0) {
    return userTenants[0]
  }

  if (user.roles?.includes('admin')) {
    const all = await req.payload.find({ collection: 'tenants', limit: 1, depth: 0, overrideAccess: true, req })
    if (all.docs[0]) return all.docs[0].id
  }

  return null
}
