import 'server-only'

import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload, type Payload } from 'payload'

import type { Tenant, User } from '@/payload-types'

export type WorkspaceRole = User['roles'][number]

export interface WorkspaceContext {
  payload: Payload
  user: User
  tenant: Tenant
  tenantId: number
  roles: WorkspaceRole[]
  canEdit: boolean
  isAdmin: boolean
}

function relationshipId(value: number | Tenant): number {
  return typeof value === 'number' ? value : value.id
}

function firstTenantId(user: User): number | null {
  const membership = user.tenants?.[0]?.tenant
  if (!membership) return null
  return relationshipId(membership)
}

/**
 * Resuelve el contexto de workspace: usuario autenticado + tenant activo.
 *
 * Orden de resolución del tenant:
 *  1. Parámetro explícito (query `?tenant=ID`), validado contra la membresía
 *     real del usuario vía access control.
 *  2. Primer tenant asignado al usuario.
 *  3. Admins sin tenant asignado: WORKSPACE_DEFAULT_TENANT (env) o el primer
 *     tenant disponible. NUNCA un slug hardcodeado.
 *
 * Usuarios sin sesión se redirigen al login; sin tenant, a /admin con error.
 */
export async function getWorkspaceContext(
  searchParams?: { tenant?: string | string[] | undefined },
): Promise<WorkspaceContext> {
  const requestHeaders = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user: authenticatedUser } = await payload.auth({ headers: requestHeaders })

  if (!authenticatedUser || authenticatedUser.collection !== 'users') {
    redirect(`/admin/login?redirect=${encodeURIComponent('/workspace')}`)
  }

  const user = authenticatedUser as User
  const roles = user.roles ?? []
  const isAdmin = roles.includes('admin')

  let tenantId: number | undefined

  const explicitTenant = Array.isArray(searchParams?.tenant)
    ? searchParams?.tenant[0]
    : searchParams?.tenant
  if (explicitTenant) {
    const parsed = Number(explicitTenant)
    if (Number.isInteger(parsed)) {
      // overrideAccess: false + user: un no-admin no puede saltarse su membresía
      const tenant = await payload.findByID({
        collection: 'tenants',
        id: parsed,
        overrideAccess: false,
        user,
      })
      if (tenant) return { payload, user, tenant, tenantId: tenant.id, roles, canEdit: isAdmin || roles.includes('agente'), isAdmin }
    }
  }

  const userTenantId = firstTenantId(user)
  if (userTenantId) {
    const tenant = await payload.findByID({
      collection: 'tenants',
      id: userTenantId,
      overrideAccess: false,
      user,
    })
    if (tenant) return { payload, user, tenant, tenantId: tenant.id, roles, canEdit: isAdmin || roles.includes('agente'), isAdmin }
  }

  if (isAdmin) {
    const defaultSlug = process.env.WORKSPACE_DEFAULT_TENANT
    const tenantResult = await payload.find({
      collection: 'tenants',
      limit: 1,
      pagination: false,
      overrideAccess: false,
      user,
      ...(defaultSlug ? { where: { slug: { equals: defaultSlug } } } : {}),
    })
    tenantId = tenantResult.docs[0]?.id
  }

  if (!tenantId) {
    redirect('/admin?workspaceError=tenant-required')
  }

  const tenant = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    overrideAccess: false,
    user,
  })

  return {
    payload,
    user,
    tenant,
    tenantId,
    roles,
    canEdit: isAdmin || roles.includes('agente'),
    isAdmin,
  }
}