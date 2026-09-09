import type { TaskConfig } from 'payload'
import type { Payload } from 'payload'

import { getMessage, isGmailSyncConfigured, listRecentMessages, type GmailMessageSummary } from '../integrations/gmail/client'
import { fetchRecentSummariesViaComposio } from '../integrations/composio/gmail'
import { getComposioForTenant } from '../integrations/composio/client'
import { composioTenantUserId, composioUserUserId } from '../integrations/composio/shared'

function isUniqueConflict(err: unknown): boolean {
  if (!err) return false
  const anyErr = err as { code?: string; originalError?: { code?: string }; message?: string }
  if (anyErr.code === '23505' || anyErr.originalError?.code === '23505') return true
  const msg = (anyErr.message || String(err)).toLowerCase()
  return (
    msg.includes('23505') ||
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('already exists')
  )
}

/**
 * Sync de email de SOLO LECTURA — espeja recibidos + enviados del buzón en
 * `email-messages` (idempotente por providerId), vinculando por matching de
 * email contra `clients`/`leads`.
 *
 * **Fuentes (fase 2b):** itera las conexiones Gmail de `tenant-connections`
 * (una por tenant, o personales por usuario — multi-tenant real). Si no hay
 * conexiones y el env legacy está configurado, corre el camino viejo para el
 * tenant de Martes (backward-compat durante la transición).
 */
export const syncEmailTask: TaskConfig = {
  slug: 'sync-email',
  label: 'Sync de email (Gmail read-only)',
  schedule: [{ cron: '*/15 * * * *', queue: 'email' }],
  inputSchema: [],
  outputSchema: [
    { name: 'synced', type: 'number' },
    { name: 'skipped', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const sources = await collectSources(req.payload)

    if (sources.length === 0) {
      return {
        output: {
          synced: 0,
          skipped: 0,
          summary:
            'Sin fuentes Gmail: ninguna conexión del tenant activa y env legacy no configurado (GMAIL_SYNC_ENABLED + GOOGLE_* + GMAIL_USER)',
        },
      }
    }

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const summaries = await source.fetch()
          const outcome = await mirrorSource(req.payload, source, summaries)
          return outcome
        } catch (err) {
          req.payload.logger.error({ msg: 'sync-email: fuente falló', source: source.label, err })
          return `[${source.label}] error: ${err instanceof Error ? err.message : 'desconocido'}`
        }
      }),
    )

    const synced = sources.reduce((acc, source) => acc + (source.lastSynced ?? 0), 0)
    return {
      output: {
        synced,
        skipped: 0,
        summary: results.join(' · '),
      },
    }
  },
}

interface EmailSource {
  label: string
  tenantId: number
  mailboxAddress: string
  fetch: () => Promise<GmailMessageSummary[]>
  lastSynced?: number
}

/** Arma las fuentes: conexiones Composio primero; env legacy como fallback. */
async function collectSources(payload: Payload): Promise<EmailSource[]> {
  const sources: EmailSource[] = []

  // SOLO conexiones de la empresa: espejar un Gmail personal en el mirror
  // compartido del tenant expondría correo privado a todos los usuarios
  // (review Devin). El sync personal por usuario llega con atribución propia.
  const connections = await payload.find({
    collection: 'tenant-connections',
    where: {
      and: [
        { toolkit: { equals: 'gmail' } },
        { estado: { equals: 'ok' } },
        { scope: { equals: 'empresa' } },
      ],
    },
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  for (const connection of connections.docs) {
    const tenantId = typeof connection.tenant === 'object' ? (connection.tenant?.id ?? null) : (connection.tenant ?? null)
    if (!tenantId) continue
    const session = await getComposioForTenant(payload, tenantId)
    if (!session) continue
    const userId =
      connection.scope === 'personal' && typeof connection.user === 'object' && connection.user?.id
        ? composioUserUserId(tenantId, connection.user.id)
        : composioTenantUserId(tenantId)
    const mailboxAddress = readMailbox(connection.config)

    sources.push({
      label: `tenant ${tenantId}${connection.scope === 'personal' ? ` (usuario ${userId})` : ''}`,
      tenantId,
      mailboxAddress,
      fetch: () => fetchRecentSummariesViaComposio(session.composio, { userId }),
    })
  }

  if (sources.length === 0 && isGmailSyncConfigured()) {
    const mailboxAddress = (process.env.GMAIL_USER ?? '').toLowerCase()
    const tenantSlug = process.env.GMAIL_TENANT_SLUG || 'martes'
    const tenantsRes = await payload.find({
      collection: 'tenants',
      where: { slug: { equals: tenantSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const tenant = tenantsRes.docs[0]
    if (tenant) {
      sources.push({
        label: `legacy env (${tenantSlug})`,
        tenantId: tenant.id,
        mailboxAddress,
        fetch: async () => {
          const refs = await listRecentMessages({ query: 'newer_than:2d' })
          const summaries = await Promise.all(refs.map((ref) => getMessage(ref.id)))
          return summaries
        },
      })
    }
  }

  return sources
}

function readMailbox(config: unknown): string {
  if (config && typeof config === 'object') {
    const mailbox = (config as { mailbox?: unknown }).mailbox
    return typeof mailbox === 'string' ? mailbox.toLowerCase() : ''
  }
  return ''
}

/** Espeja un lote de summaries para un tenant — lógica idéntica al camino legacy. */
async function mirrorSource(
  payload: Payload,
  source: EmailSource,
  summaries: GmailMessageSummary[],
): Promise<string> {
  if (summaries.length === 0) {
    source.lastSynced = 0
    return `[${source.label}] sin mensajes en la ventana de 2 días`
  }

  const clientsByEmail = new Map<string, number>()
  let clientPage = 1
  while (true) {
    const res = await payload.find({
      collection: 'clients',
      where: { and: [{ tenant: { equals: source.tenantId } }, { email: { exists: true } }] },
      limit: 500,
      page: clientPage,
      depth: 0,
      overrideAccess: true,
    })
    for (const client of res.docs) {
      if (client.email) clientsByEmail.set(client.email.toLowerCase().trim(), client.id)
    }
    if (!res.hasNextPage) break
    clientPage++
  }

  const leadsByEmail = new Map<string, number>()
  let leadPage = 1
  while (true) {
    const res = await payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: source.tenantId } }, { email: { exists: true } }] },
      limit: 500,
      page: leadPage,
      depth: 0,
      overrideAccess: true,
    })
    for (const lead of res.docs) {
      if (lead.email) leadsByEmail.set(lead.email.toLowerCase().trim(), lead.id)
    }
    if (!res.hasNextPage) break
    leadPage++
  }

  // Mensajes ya espejados previamente (para revinculación y para no duplicar).
  const existingRes = await payload.find({
    collection: 'email-messages',
    where: {
      and: [
        { tenant: { equals: source.tenantId } },
        { providerId: { in: summaries.map((summary) => summary.id) } },
      ],
    },
    limit: summaries.length,
    depth: 0,
    overrideAccess: true,
  })

  const existingByProviderId = new Map<string, (typeof existingRes.docs)[number]>()
  for (const doc of existingRes.docs) {
    existingByProviderId.set(doc.providerId, doc)
  }

  // Recomputar vínculos de contacto para mensajes ya espejados en la ventana.
  let relinked = 0
  for (const doc of existingRes.docs) {
    const candidateEmails = (
      doc.direction === 'outbound'
        ? [...(doc.toEmails ? doc.toEmails.split(',') : []), ...(doc.ccEmails ? doc.ccEmails.split(',') : [])]
        : doc.fromEmail
          ? [doc.fromEmail]
          : []
    )
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0 && email.includes('@') && email !== source.mailboxAddress)

    let matchedClientId: number | null = null
    let matchedLeadId: number | null = null
    for (const email of candidateEmails) {
      if (!matchedClientId && clientsByEmail.has(email)) matchedClientId = clientsByEmail.get(email)!
      if (!matchedLeadId && leadsByEmail.has(email)) matchedLeadId = leadsByEmail.get(email)!
      if (matchedClientId && matchedLeadId) break
    }

    const currentClientId =
      typeof doc.client === 'object' && doc.client !== null ? doc.client.id : (doc.client ?? null)
    const currentLeadId = typeof doc.lead === 'object' && doc.lead !== null ? doc.lead.id : (doc.lead ?? null)

    if (currentClientId !== matchedClientId || currentLeadId !== matchedLeadId) {
      try {
        await payload.update({
          collection: 'email-messages',
          id: doc.id,
          data: { client: matchedClientId, lead: matchedLeadId },
          overrideAccess: true,
        })
        relinked += 1
      } catch (err) {
        payload.logger.error({ msg: 'sync-email: error al revincular contacto', id: doc.id, err })
      }
    }
  }

  let synced = 0
  let failed = 0
  const errors: string[] = []

  for (const msg of summaries) {
    if (existingByProviderId.has(msg.id)) continue

    const candidateEmails = (
      msg.outbound ? [...msg.toEmails, ...msg.ccEmails] : msg.fromEmail ? [msg.fromEmail] : []
    ).filter((email) => email !== source.mailboxAddress)

    let clientId: number | null = null
    let leadId: number | null = null
    for (const email of candidateEmails) {
      if (!clientId && clientsByEmail.has(email)) clientId = clientsByEmail.get(email)!
      if (!leadId && leadsByEmail.has(email)) leadId = leadsByEmail.get(email)!
      if (clientId && leadId) break
    }

    try {
      await payload.create({
        collection: 'email-messages',
        data: {
          tenant: source.tenantId,
          direction: msg.outbound ? 'outbound' : 'inbound',
          providerId: msg.id,
          threadId: msg.threadId,
          fromEmail: msg.fromEmail ?? undefined,
          fromName: msg.fromName ?? undefined,
          toEmails: msg.toEmails.length > 0 ? msg.toEmails.join(', ') : undefined,
          ccEmails: msg.ccEmails.length > 0 ? msg.ccEmails.join(', ') : undefined,
          subject: msg.subject ?? undefined,
          snippet: msg.snippet ? msg.snippet.slice(0, 1000) : undefined,
          date: msg.date,
          client: clientId,
          lead: leadId,
        },
        overrideAccess: true,
      })
      synced += 1
    } catch (err) {
      if (isUniqueConflict(err)) {
        synced += 1 // otro worker ya insertó el mensaje
        continue
      }
      failed += 1
      const message = err instanceof Error ? err.message : 'error desconocido'
      if (errors.length < 5) errors.push(`(${msg.id}) ${message}`)
      payload.logger.error({ msg: 'sync-email: mensaje falló', id: msg.id, err })
    }
  }

  source.lastSynced = synced
  const skipped = summaries.length - synced - failed
  const details = [
    `${synced} espejados`,
    relinked > 0 ? `${relinked} revinculados` : null,
    `${failed} fallidos`,
    `de ${summaries.length} revisados`,
  ]
    .filter(Boolean)
    .join(', ')

  return `[${source.label}] ${details}${errors.length > 0 ? ` — ${errors.join(' | ')}` : ''}${skipped > 0 ? '' : ''}`
}

/**
 * Ejecuta el sync de email para UN tenant inmediatamente (botón "Sincronizar
 * ahora" del hub). Mismas fuentes y espejo que el job; sin tocar otros tenants.
 */
export async function runGmailSyncForTenant(payload: Payload, tenantId: number): Promise<string> {
  const sources = (await collectSources(payload)).filter((source) => source.tenantId === tenantId)
  if (sources.length === 0) {
    return 'Sin conexión Gmail de la empresa activa para este tenant (o sin key de Composio asignada)'
  }
  const results: string[] = []
  for (const source of sources) {
    try {
      const summaries = await source.fetch()
      results.push(await mirrorSource(payload, source, summaries))
    } catch (err) {
      results.push(`[${source.label}] error: ${err instanceof Error ? err.message : 'desconocido'}`)
    }
  }
  return results.join(' · ')
}
