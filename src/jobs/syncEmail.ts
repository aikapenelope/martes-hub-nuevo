import type { TaskConfig } from 'payload'

import { getMessage, isGmailSyncConfigured, listRecentMessages } from '../integrations/gmail/client'

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

    const refs = await listRecentMessages({ query: 'newer_than:2d' })
    if (refs.length === 0) {
      return { output: { synced: 0, skipped: 0, summary: 'Sin mensajes en la ventana de 2 días' } }
    }

    // Matching en bloque paginado: todas las direcciones de clients/leads → id
    const clientsByEmail = new Map<string, number>()
    let clientPage = 1
    while (true) {
      const res = await req.payload.find({
        collection: 'clients',
        where: { and: [{ tenant: { equals: tenant.id } }, { email: { exists: true } }] },
        limit: 500,
        page: clientPage,
        depth: 0,
        overrideAccess: true,
        req,
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
      const res = await req.payload.find({
        collection: 'leads',
        where: { and: [{ tenant: { equals: tenant.id } }, { email: { exists: true } }] },
        limit: 500,
        page: leadPage,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const lead of res.docs) {
        if (lead.email) leadsByEmail.set(lead.email.toLowerCase().trim(), lead.id)
      }
      if (!res.hasNextPage) break
      leadPage++
    }

    // Mensajes ya espejados previamente
    const existingRes = await req.payload.find({
      collection: 'email-messages',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { providerId: { in: refs.map((r) => r.id) } },
        ],
      },
      limit: refs.length,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const existingByProviderId = new Map<string, (typeof existingRes.docs)[number]>()
    for (const doc of existingRes.docs) {
      existingByProviderId.set(doc.providerId, doc)
    }

    // Recomputar vínculos de contacto para mensajes ya espejados en la ventana de 2 días.
    // Si un cliente o lead se creó o cambió de email posteriormente, se enlaza sin reescribir metadata inmutable.
    let relinked = 0
    for (const doc of existingRes.docs) {
      const candidateEmails = (
        doc.direction === 'outbound'
          ? [...(doc.toEmails ? doc.toEmails.split(',') : []), ...(doc.ccEmails ? doc.ccEmails.split(',') : [])]
          : doc.fromEmail ? [doc.fromEmail] : []
      )
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@') && e !== mailboxAddress)

      let matchedClientId: number | null = null
      let matchedLeadId: number | null = null
      for (const email of candidateEmails) {
        if (!matchedClientId && clientsByEmail.has(email)) matchedClientId = clientsByEmail.get(email)!
        if (!matchedLeadId && leadsByEmail.has(email)) matchedLeadId = leadsByEmail.get(email)!
        if (matchedClientId && matchedLeadId) break
      }

      const currentClientId =
        typeof doc.client === 'object' && doc.client !== null ? doc.client.id : (doc.client ?? null)
      const currentLeadId =
        typeof doc.lead === 'object' && doc.lead !== null ? doc.lead.id : (doc.lead ?? null)

      if (currentClientId !== matchedClientId || currentLeadId !== matchedLeadId) {
        try {
          await req.payload.update({
            collection: 'email-messages',
            id: doc.id,
            data: {
              client: matchedClientId,
              lead: matchedLeadId,
            },
            overrideAccess: true,
            req,
          })
          relinked += 1
        } catch (err) {
          req.payload.logger.error({ msg: 'sync-email: error al revincular contacto', id: doc.id, err })
        }
      }
    }

    const pending = refs.filter((r) => !existingByProviderId.has(r.id))
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

        let clientId: number | null = null
        let leadId: number | null = null
        for (const email of candidateEmails) {
          if (!clientId && clientsByEmail.has(email)) clientId = clientsByEmail.get(email)!
          if (!leadId && leadsByEmail.has(email)) leadId = leadsByEmail.get(email)!
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
            client: clientId,
            lead: leadId,
          },
          overrideAccess: true,
          req,
        })
        synced += 1
      } catch (err) {
        if (isUniqueConflict(err)) {
          // Carrera de inserción concurrente: otro worker ya insertó el mensaje.
          try {
            const conflictDoc = await req.payload.find({
              collection: 'email-messages',
              where: {
                and: [
                  { tenant: { equals: tenant.id } },
                  { providerId: { equals: ref.id } },
                ],
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
              req,
            })
            const existing = conflictDoc.docs[0]
            if (existing) {
              synced += 1
              continue
            }
          } catch (retryErr) {
            req.payload.logger.error({ msg: 'sync-email: reintento tras conflicto falló', id: ref.id, err: retryErr })
          }
        }
        failed += 1
        const message = err instanceof Error ? err.message : 'error desconocido'
        if (errors.length < 5) errors.push(`(${ref.id}) ${message}`)
        req.payload.logger.error({ msg: 'sync-email: mensaje falló', id: ref.id, err })
      }
    }

    const skipped = refs.length - synced - failed
    const summaryDetails = [
      `${synced} espejados`,
      relinked > 0 ? `${relinked} revinculados` : null,
      `${failed} fallidos`,
      `de ${refs.length} revisados`,
    ]
      .filter(Boolean)
      .join(', ')

    return {
      output: {
        synced,
        skipped,
        summary: summaryDetails + (errors.length > 0 ? ` — ${errors.join(' | ')}` : ''),
      },
    }
  },
}
