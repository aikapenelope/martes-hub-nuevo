import { config as loadDotenv } from 'dotenv'
loadDotenv()

if (process.env.DATABASE_URL_DIRECT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT
}

import { getPayload } from 'payload'

import config from '../src/payload.config.js'

export const DEV_USER = {
  email: 'dev@martes.local',
  password: 'test',
  roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
}

export async function seedDevUser(): Promise<void> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_USER.email } },
    limit: 1,
  })

  const tenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: 'martes' } },
    limit: 1,
  })
  const tenantId = tenants.docs[0]?.id

  if (!tenantId) {
    throw new Error('No existe el tenant default; corre primero seed-default-tenant')
  }

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { roles: DEV_USER.roles, tenants: [{ tenant: tenantId }] },
    })
    payload.logger.info({ msg: 'usuario dev actualizado', email: DEV_USER.email })
    return
  }

  await payload.create({
    collection: 'users',
    data: {
      ...DEV_USER,
      firstName: 'Dev',
      lastName: 'Martes',
      tenants: [{ tenant: tenantId }],
    },
  })
  payload.logger.info({ msg: 'usuario dev creado', email: DEV_USER.email })
}

await seedDevUser()
process.exit(0)
