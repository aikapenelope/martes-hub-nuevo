import type { Payload, PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

/**
 * Selección de destinatarios de campaña — FUENTE ÚNICA compartida por el
 * job de envío (sendCampaignTask) y el conteo del editor, para que la
 * vista previa de alcance nunca se desvie de lo que realmente se envía.
 *
 * Reglas (idénticas en ambas rutas) — contrato del editor "Todos los
 * leads/clientes con email":
 * - Leads del tenant (del rubro si se indica; no descartados, sin convertir,
 *   con email).
 * - Clientes del tenant SIEMPRE (del rubro si se indica; etapa ≠ perdido,
 *   sin opt-out, con email) — una campaña masiva sin segmento no puede
 *   excluir a la cartera de clientes.
 * - Límite de 500 por consulta (tope heredado del job de envío).
 * - Dedupe por email en minúsculas (un correo = un destinatario).
 */

export interface CampaignRecipient {
  email: string
  name: string
  leadId?: number
  clientId?: number
}

interface CollectOptions {
  payload: Payload
  tenantId: number
  segmentId: number | undefined
  /** Vía job del sistema usa overrideAccess; vía workspace va con user. */
  user?: User
  req?: PayloadRequest
}

export async function collectCampaignRecipients({
  payload,
  tenantId,
  segmentId,
  user,
  req,
}: CollectOptions): Promise<Map<string, CampaignRecipient>> {
  const opts = user
    ? { overrideAccess: false as const, user, ...(req ? { req } : {}) }
    : { overrideAccess: true as const, ...(req ? { req } : {}) }

  const recipients = new Map<string, CampaignRecipient>()
  const segmentFilter = segmentId ? [{ segment: { equals: segmentId } }] : []

  const leads = await payload.find({
    collection: 'leads',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        ...segmentFilter,
        { status: { not_equals: 'descartado' } },
        { convertedClient: { exists: false } },
        { email: { exists: true } },
      ],
    },
    limit: 500,
    depth: 0,
    ...opts,
  })
  for (const lead of leads.docs as Array<{ email?: string | null; fullName?: string; id: number }>) {
    if (lead.email) {
      recipients.set(lead.email.toLowerCase(), {
        email: lead.email,
        name: lead.fullName ?? '',
        leadId: lead.id,
      })
    }
  }

  // Clientes SIEMPRE participan (contrato del editor: "Todos los leads/
  // clientes con email") — con sus filtros de protección intactos.
  const clients = await payload.find({
    collection: 'clients',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        ...segmentFilter,
        { stage: { not_equals: 'perdido' } },
        { optOutAt: { exists: false } },
        { email: { exists: true } },
      ],
    },
    limit: 500,
    depth: 0,
    ...opts,
  })
  for (const client of clients.docs as Array<{ email?: string | null; name?: string; id: number }>) {
    if (client.email) {
      recipients.set(client.email.toLowerCase(), {
        email: client.email,
        name: client.name ?? '',
        clientId: client.id,
      })
    }
  }

  return recipients
}
