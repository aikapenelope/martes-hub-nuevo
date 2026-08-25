import { getPayload } from 'payload'

import config from '../payload.config.js'

export async function seed(): Promise<void> {
  const payload = await getPayload({ config })
  await payload.create({
    collection: 'clients',
    data: {
      name: '584121199988',
      phone: '584121199988',
      email: 'ana.enrich@test.com',
      tenant: 1,
    },
    overrideAccess: true,
  })
}

await seed()
