import { getPayload } from 'payload'

import config from '../src/payload.config.js'

export const DEFAULT_TENANT = {
  name: 'Martes',
  slug: 'martes',
}

export async function seedDefaultTenant(): Promise<void> {
  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: DEFAULT_TENANT.slug } },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    payload.logger.info({ msg: 'tenant default ya existe', slug: DEFAULT_TENANT.slug })
    return
  }

  await payload.create({
    collection: 'tenants',
    data: DEFAULT_TENANT,
  })
  payload.logger.info({ msg: 'tenant default creado', slug: DEFAULT_TENANT.slug })
}

await seedDefaultTenant()
