import type { TaskConfig } from 'payload'

import { getMessage, isGmailSyncConfigured, listRecentMessages } from '../integrations/gmail/client'

/**
 * Sync de email de SOLO LECTURA (Fase B). Sustrae recibidos + enviados del
 * buzón Gmail configurado y los espeja en `email-messages` (idempotente por
 * providerId), vinculando por matching de email contra `clients`/`leads`
 * (mismo criterio que el auto-matching de Tally en `Clients.ts`).
 *
 * Espejar el buzón completo cada corrida es carísimo; con `newer_than:2d` y
 * dedupe por providerId el costo se mantiene constante y el re-procesado es
 * barato (list metadata + find en bloque). El envío del CRM no pasa por aquí
 * — eso sigue siendo Resend y vive en `email-log`.
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
    if (!isGmailSyncConfigured()) {
      return {
        output: {
          synced: 0,
          skipped: 0,
          summary:
            'Gmail no configurado — requiere GMAIL_SYNC_ENABLED=true + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN + GMAIL_USER',
        },
      }
    }

    const mailboxAddress = (process.env.GMAIL_USER ?? '').toLowerCase()
    const tenantSlug = process.env.GMAIL_TENANT_SLUG || 'martes'

    const tenantsRes = await req.payload.find({
      collection: 'tenants',
      where: { slug: { equals: tenantSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const tenant = tenantsRes.docs[0]
    if (!tenant) {
      return { output: { synced: 0, skipped: 0, summary: `Tenant slug "${tenantSlug}" no encontrado` } }
    }

    const refs = await listRecentMessages({ query: 'newer_than:2d', maxResults: 150 })
    if (refs.length === 0) {
      return { output: { synced: 0, skipped: 0, summary: 'Sin mensajes en la ventana de 2 días' } }
    }

    // Idempotencia en bloque: una sola consulta para todos los mensajes
    const existingRes = await req.payload.find({
      collection: 'email-messages',
      where: { providerId: { in: refs.map((r) => r.id) } },
      limit: refs.length,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const alreadySynced = new Set(existingRes.docs.map((d) => d.providerId))
    const pending = refs.filter((r) => !alreadySynced.has(r.id))
    if (pending.length === 0) {
      return { output: { synced: 0, skipped: refs.length, summary: 'Todo ya espejado' } }
    }

    // Matching en bloque: direcciones de clients/leads → id
    const [clientsRes, leadsRes] = await Promise.all([
      req.payload.find({
        collection: 'clients',
        where: { and: [{ tenant: { equals: tenant.id } }, { email: { exists: true } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
        req,
      }),
      req.payload.find({
        collection: 'leads',
        where: { and: [{ tenant: { equals: tenant.id } }, { email: { exists: true } }] },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
        req,
      }),
    ])
    const clientsByEmail = new Map<string, number>()
    for (const client of clientsRes.docs) {
      if (client.email) clientsByEmail.set(client.email.toLowerCase(), client.id)
    }
    const leadsByEmail = new Map<string, number>()
    for (const lead of leadsRes.docs) {
      if (lead.email) leadsByEmail.set(lead.email.toLowerCase(), lead.id)
    }

    let synced = 0
    let failed = 0
    const errors: string[] = []

    for (const ref of pending) {
      try {
        const msg = await getMessage(ref.id)

        // El propio buzón nunca es el contacto: en salientes el destino está
        // en To/Cc; en entrantes, el remitente.
        const candidateEmails = (
          msg.outbound ? [...msg.toEmails, ...msg.ccEmails] : msg.fromEmail ? [msg.fromEmail] : []
        ).filter((email) => email !== mailboxAddress)

        let clientId: number | undefined
        let leadId: number | undefined
        for (const email of candidateEmails) {
          if (!clientId && clientsByEmail.has(email)) clientId = clientsByEmail.get(email)
          if (!leadId && leadsByEmail.has(email)) leadId = leadsByEmail.get(email)
          if (clientId && leadId) break
        }

        await req.payload.create({
          collection: 'email-messages',
          data: {
            tenant: tenant.id,
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
            ...(clientId ? { client: clientId } : {}),
            ...(leadId ? { lead: leadId } : {}),
          },
          overrideAccess: true,
          req,
        })
        synced += 1
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : 'error desconocido'
        if (errors.length < 5) errors.push(`(${ref.id}) ${message}`)
        req.payload.logger.error({ msg: 'sync-email: mensaje falló', id: ref.id, err })
      }
    }

    return {
      output: {
        synced,
        skipped: refs.length - synced - failed,
        summary:
          `${synced} espejados, ${failed} fallidos de ${refs.length} revisados` +
          (errors.length > 0 ? ` — ${errors.join(' | ')}` : ''),
      },
    }
  },
}
