import type { PayloadRequest } from 'payload'
import type { User } from '@/payload-types'
import { collectFollowupsToday } from '@/lib/followups-today'
import { resolveUserTenantId } from './tenantResolution'

/**
 * GET /api/followups/hoy — JSON con los contactos a los que toca dar
 * seguimiento hoy. La lógica de negocio vive en lib/followups-today.ts
 * (misma fuente que el strip del cockpit): aquí solo autenticamos,
 * resolvemos tenant y serializamos.
 */
export async function followupsHoyHandler(req: PayloadRequest): Promise<Response> {
  const user = req.user as User | null
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  const tenantId = await resolveUserTenantId(req, 'http://local.payload/api/followups/hoy')
  if (!tenantId) {
    return Response.json({ error: 'Tenant no resoluble' }, { status: 422 })
  }

  const items = await collectFollowupsToday({ payload: req.payload, user, tenantId })

  return Response.json(
    { items: items.slice(0, 50), generatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
