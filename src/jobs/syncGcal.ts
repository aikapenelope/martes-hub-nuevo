import type { TaskConfig } from 'payload'

import { isGcalSyncConfigured, listUpcomingEvents } from '../integrations/gcal/client'

/**
 * Sync de calendario de SOLO LECTURA (Fase C) — el job `sync-gcal` que el
 * README ya prometía. Espeja los eventos de la ventana [ahora-1d, +365d] en
 * `appointments` (idempotente por gcalEventId; los cancelados se marcan
 * `cancelled`) y los vincula por matching de asistentes contra
 * `clients`/`leads` (mismo criterio que el auto-matching de Tally).
 *
 * Escribir en el calendario no ocurre aquí: las citas las crea el agente de
 * OpenBSP; este job solo consume la data.
 */
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
    const horizonDaysRaw = Number(process.env.GCAL_SYNC_HORIZON_DAYS || 365)
    const horizonDays = Number.isFinite(horizonDaysRaw) && horizonDaysRaw > 0 ? horizonDaysRaw : 365
    const timeMax = new Date(Date.now() + horizonDays * 24 * 3600_000).toISOString()
    const events = await listUpcomingEvents({ calendarId, timeMin, timeMax })
    const returnedEventIds = new Set(events.map((e) => e.id))

    // Reconciliación de ventana autoritativa con cursor estable por ID:
    // Citas en la BD dentro de [timeMin, timeMax] que ya no están presentes en la
    // respuesta de Google (fueron movidas a fechas fuera de los 30 días o eliminadas).
    // Usar cursor por ID asegura que cancelar filas no desplace la paginación ni omita registros.
    let lastId = 0
    let reconciled = 0
    while (true) {
      const windowRes = await req.payload.find({
        collection: 'appointments',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            {
              or: [
                { calendarId: { equals: calendarId } },
                { calendarId: { exists: false } },
              ],
            },
            { start: { greater_than_equal: timeMin } },
            { start: { less_than_equal: timeMax } },
            { status: { not_equals: 'cancelled' } },
            { id: { greater_than: lastId } },
          ],
        },
        limit: 500,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (windowRes.docs.length === 0) break

      for (const stale of windowRes.docs) {
        lastId = Math.max(lastId, stale.id)
        if (!returnedEventIds.has(stale.gcalEventId)) {
          try {
            await req.payload.update({
              collection: 'appointments',
              id: stale.id,
              data: { status: 'cancelled' },
              overrideAccess: true,
              req,
            })
            reconciled += 1
          } catch (err) {
            req.payload.logger.error({ msg: 'sync-gcal: error al reconciliar cita obsoleta', id: stale.id, err })
          }
        }
      }

      if (!windowRes.hasNextPage && windowRes.docs.length < 500) break
    }

    if (events.length === 0) {
      return {
        output: {
          synced: 0,
          summary: `Sin eventos en la ventana de 30 días${reconciled > 0 ? ` (${reconciled} citas obsoletas canceladas)` : ''}`,
        },
      }
    }

    // Idempotencia + upsert en bloque: qué eventos ya están espejados
    const existingRes = await req.payload.find({
      collection: 'appointments',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { gcalEventId: { in: events.map((e) => e.id) } },
        ],
      },
      limit: events.length,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const existingByEventId = new Map(existingRes.docs.map((d) => [d.gcalEventId, d.id]))

    // Matching en bloque paginado de asistentes → clients/leads del tenant
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
        endDate: event.end ?? null,
        allDay: event.allDay,
        status: event.status,
        location: event.location ?? null,
        attendees: attendeeEmails.length > 0 ? attendeeEmails.join(', ') : null,
        description: event.description ?? null,
        gcalEventId: event.id,
        calendarId,
        htmlLink: event.htmlLink ?? null,
        client: clientId ?? null,
        lead: leadId ?? null,
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
        if (isUniqueConflict(err)) {
          // Carrera de inserción concurrente: otro worker ya insertó el evento. Reintentar como update.
          try {
            const conflictDoc = await req.payload.find({
              collection: 'appointments',
              where: {
                and: [
                  { tenant: { equals: tenant.id } },
                  { gcalEventId: { equals: event.id } },
                ],
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
              req,
            })
            if (conflictDoc.docs[0]) {
              await req.payload.update({
                collection: 'appointments',
                id: conflictDoc.docs[0].id,
                data,
                overrideAccess: true,
                req,
              })
              existingByEventId.set(event.id, conflictDoc.docs[0].id)
              synced += 1
              continue
            }
          } catch (retryErr) {
            req.payload.logger.error({ msg: 'sync-gcal: reintento tras conflicto falló', id: event.id, err: retryErr })
          }
        }
        failed += 1
        req.payload.logger.error({ msg: 'sync-gcal: evento falló', id: event.id, err })
      }
    }

    return {
      output: {
        synced,
        summary: `${synced} eventos espejados${reconciled > 0 ? ` (${reconciled} obsoletos cancelados)` : ''} (${failed} fallidos) de ${events.length} en [${calendarId}]`,
      },
    }
  },
}
