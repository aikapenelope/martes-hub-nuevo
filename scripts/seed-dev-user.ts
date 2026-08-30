import { config as loadDotenv } from 'dotenv'
loadDotenv()

if (process.env.DATABASE_URL_DIRECT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT
}

if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED_DEV_USER) {
  throw new Error('FATAL: seed-dev-user cannot be executed in production environment without explicit ALLOW_SEED_DEV_USER=1.')
}

import { getPayload } from 'payload'

import config from '../src/payload.config.js'

export const DEV_USER = {
  email: 'dev@martes.local',
  password: process.env.DEV_USER_PASSWORD || 'test',
  roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
}

export async function seedDevUser(): Promise<void> {
  // Guardia dura: este usuario tiene credenciales fijas y conocidas
  // (dev@martes.local / "test") con rol admin. Ejecutarlo contra producción
  // por accidente (un hook de deploy mal configurado, correrlo localmente
  // con env vars de prod cargadas) crearía/mantendría una puerta trasera de
  // superusuario con contraseña trivial.
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('FATAL: seed-dev-user no puede ejecutarse en producción (NODE_ENV=production o VERCEL).')
  }

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
