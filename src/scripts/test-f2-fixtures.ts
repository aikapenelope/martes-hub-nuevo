import { getPayload } from 'payload'

import config from '../payload.config.js'

export async function seedFixtures(): Promise<void> {
  const payload = await getPayload({ config })

  const clients = await payload.find({ collection: 'clients', where: { name: { equals: 'Cliente F2 Test' } }, limit: 1 })
  let clientId = clients.docs[0]?.id

  if (!clientId) {
    const client = await payload.create({
      collection: 'clients',
      data: { name: 'Cliente F2 Test', email: 'clientef2@test.com', stage: 'activo', tenant: 1 },
      overrideAccess: true,
    })
    clientId = client.id
  }

  const tomorrow = new Date(Date.now() - 4 * 3_600_000 + 86_400_000).toISOString().slice(0, 10)
  await payload.create({
    collection: 'payments',
    data: {
      client: clientId,
      amount: 150,
      concept: 'Mensualidad test F2',
      dueDate: `${tomorrow}T00:00:00-04:00`,
      status: 'pendiente',
      tenant: 1,
    },
    overrideAccess: true,
  })

  payload.logger.info({ msg: 'fixture listo', clientId })
}

await seedFixtures()
