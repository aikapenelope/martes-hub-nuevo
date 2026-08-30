import { getPayload } from 'payload'
import configPromise from '@/payload.config'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
  roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
}

/**
 * Seeds a test user and default tenant for e2e tests.
 */
export async function seedTestUser(): Promise<void> {
  const config = await configPromise
  const payload = await getPayload({ config })

  // Ensure default tenant exists
  const existingTenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: 'martes' } },
    limit: 1,
  })

  let defaultTenantId: number
  if (existingTenants.docs.length === 0) {
    const createdTenant = await payload.create({
      collection: 'tenants',
      data: {
        name: 'Martes Demo',
        slug: 'martes',
      },
    })
    defaultTenantId = createdTenant.id
  } else {
    defaultTenantId = existingTenants.docs[0].id
  }

  // Delete existing test user by ID if any
  const existingUsers = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
    limit: 10,
  })

  for (const user of existingUsers.docs) {
    await payload.delete({
      collection: 'users',
      id: user.id,
    })
  }

  // Create fresh test user with tenant membership
  await payload.create({
    collection: 'users',
    data: {
      ...testUser,
      tenants: [
        {
          tenant: defaultTenantId,
        },
      ],
    },
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  // Kept non-destructive to avoid tearing down shared state during test runs
}

