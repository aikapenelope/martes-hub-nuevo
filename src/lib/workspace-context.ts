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

export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const requestHeaders = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user: authenticatedUser } = await payload.auth({ headers: requestHeaders })

  if (!authenticatedUser || authenticatedUser.collection !== 'users') {
    redirect(`/admin/login?redirect=${encodeURIComponent('/overview')}`)
  }

  const user = authenticatedUser as User
  const roles = user.roles ?? []
  const isAdmin = roles.includes('admin')

  let tenantId = user.tenants?.[0]?.tenant
    ? relationshipId(user.tenants[0].tenant)
    : undefined

  if (!tenantId && isAdmin) {
    const tenantResult = await payload.find({
      collection: 'tenants',
      limit: 1,
      pagination: false,
      overrideAccess: false,
      user,
      where: { slug: { equals: 'martes' } },
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
