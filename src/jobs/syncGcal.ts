import type { TaskConfig } from 'payload'

import { isGcalSyncConfigured, listUpcomingEvents } from '../integrations/gcal/client'

/**
 * Sync de calendario de SOLO LECTURA (Fase C) — el job `sync-gcal` que el
 * README ya prometía. Espeja los eventos de la ventana [ahora-1d, +30d] en
 * `appointments` (idempotente por gcalEventId; los cancelados se marcan
 * `cancelled`) y los vincula por matching de asistentes contra
 * `clients`/`leads` (mismo criterio que el auto-matching de Tally).
 *
 * Escribir en el calendario no ocurre aquí: las citas las crea el agente de
 * OpenBSP; este job solo consume la data.
 */
export const syncGcalTask: TaskConfig = {
  slug: 'sync-gcal',
  label: 'Sync de citas (Google Calendar read-only)',
  schedule: [{ cron: '*/15 * * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'synced', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!isGcalSyncConfigured()) {
      return {
        output: {
          synced: 0,
          summary:
            'GCal no configurado — requiere GCAL_SYNC_ENABLED=true + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (scope calendar.readonly)',
        },
      }
    }

    const tenantSlug = process.env.GCAL_TENANT_SLUG || 'martes'
    const calendarId = process.env.GCAL_CALENDAR_ID || 'primary'
    // Excluir al dueño del calendario del matching de asistentes.
    const organizerAddress = (process.env.GCAL_USER ?? process.env.GMAIL_USER ?? '').toLowerCase()

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
      return { output: { synced: 0, summary: `Tenant slug "${tenantSlug}" no encontrado` } }
    }

    const timeMin = new Date(Date.now() - 24 * 3600_000).toISOString()
    const timeMax = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
    const events = await listUpcomingEvents({ calendarId, timeMin, timeMax })
    if (events.length === 0) {
      return { output: { synced: 0, summary: 'Sin eventos en la ventana de 30 días' } }
    }

    // Idempotencia + upsert en bloque: qué eventos ya están espejados
    const existingRes = await req.payload.find({
      collection: 'appointments',
      where: { gcalEventId: { in: events.map((e) => e.id) } },
      limit: events.length,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const existingByEventId = new Map(existingRes.docs.map((d) => [d.gcalEventId, d.id]))

    // Matching en bloque de asistentes → clients/leads del tenant
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

    for (const event of events) {
      const attendeeEmails = event.attendeeEmails.filter((email) => email !== organizerAddress)
      let clientId: number | undefined
      let leadId: number | undefined
      for (const email of attendeeEmails) {
        if (!clientId && clientsByEmail.has(email)) clientId = clientsByEmail.get(email)
        if (!leadId && leadsByEmail.has(email)) leadId = leadsByEmail.get(email)
        if (clientId && leadId) break
      }

      const data = {
        tenant: tenant.id,
        title: event.summary ?? '(evento sin título)',
        start: event.start,
        endDate: event.end,
        allDay: event.allDay,
        status: event.status,
        location: event.location ?? undefined,
        attendees: attendeeEmails.length > 0 ? attendeeEmails.join(', ') : undefined,
        description: event.description ?? undefined,
        gcalEventId: event.id,
        calendarId,
        htmlLink: event.htmlLink ?? undefined,
        ...(clientId ? { client: clientId } : {}),
        ...(leadId ? { lead: leadId } : {}),
      }

      try {
        const existingId = existingByEventId.get(event.id)
        if (existingId) {
          await req.payload.update({
            collection: 'appointments',
            id: existingId,
            data,
            overrideAccess: true,
            req,
          })
        } else {
          await req.payload.create({
            collection: 'appointments',
            data,
            overrideAccess: true,
            req,
          })
        }
        synced += 1
      } catch (err) {
        failed += 1
        req.payload.logger.error({ msg: 'sync-gcal: evento falló', id: event.id, err })
      }
    }

    return {
      output: {
        synced,
        summary: `${synced} eventos espejados (${failed} fallidos) de ${events.length} en [${calendarId}]`,
      },
    }
  },
}
