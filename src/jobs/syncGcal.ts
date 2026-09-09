import type { Payload, TaskConfig } from 'payload'

import {
  isGcalSyncConfigured,
  listUpcomingEvents,
  type GcalEventSummary,
} from '../integrations/gcal/client'
import { fetchUpcomingEventsViaComposio } from '../integrations/composio/gcal'
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
 * Sync de calendario de SOLO LECTURA — espeja los eventos de la ventana
 * [ahora-1d, +365d] en `appointments` (idempotente por gcalEventId; los
 * cancelados se marcan `cancelled`) y los vincula por matching de asistentes
 * contra `clients`/`leads`.
 *
 * **Fuentes (fase 2c):** itera las conexiones Google Calendar de
 * `tenant-connections` (`config.calendarId` por conexión). Si no hay
 * conexiones y el env legacy está configurado, corre el camino viejo para el
 * tenant de Martes. Escribir en el calendario no ocurre aquí.
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
    const sources = await collectSources(req.payload)

    if (sources.length === 0) {
      return {
        output: {
          synced: 0,
          summary:
            'Sin fuentes GCal: ninguna conexión del tenant activa y env legacy no configurado (GCAL_SYNC_ENABLED + GOOGLE_*)',
        },
      }
    }

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const events = await source.fetch()
          const summary = await mirrorSource(req.payload, source, events)
          return summary
        } catch (err) {
          req.payload.logger.error({ msg: 'sync-gcal: fuente falló', source: source.label, err })
          return `[${source.label}] error: ${err instanceof Error ? err.message : 'desconocido'}`
        }
      }),
    )

    return {
      output: {
        synced: sources.reduce((acc, source) => acc + (source.lastSynced ?? 0), 0),
        summary: results.join(' · '),
      },
    }
  },
}

interface GcalSource {
  label: string
  tenantId: number
  /** null = camino legacy por env (pre-Composio): citas sin conexión origen. */
  connectionId: number | null
  calendarId: string
  organizerAddress: string
  timezone: string
  horizonDays: number
  fetch: () => Promise<GcalEventSummary[]>
  lastSynced?: number
}

async function collectSources(payload: Payload): Promise<GcalSource[]> {
  const sources: GcalSource[] = []

  // SOLO conexiones de la empresa: el calendario personal de un usuario no se
  // espeja al calendario compartido del tenant (misma razón de privacidad que
  // sync-email). El sync personal llega con la fase de atribución por usuario.
  const connections = await payload.find({
    collection: 'tenant-connections',
    where: {
      and: [
        { toolkit: { equals: 'googlecalendar' } },
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

    const config = (connection.config ?? {}) as Record<string, unknown>
    const calendarId = typeof config.calendarId === 'string' && config.calendarId ? config.calendarId : 'primary'
    const organizerAddress =
      typeof config.mailbox === 'string' ? config.mailbox.toLowerCase() : ''
    const timezone = typeof config.timezone === 'string' ? config.timezone : (process.env.GCAL_TIMEZONE ?? 'America/Caracas')
    const horizonRaw = typeof config.horizonDays === 'string' || typeof config.horizonDays === 'number' ? Number(config.horizonDays) : 365
    const horizonDays = Number.isFinite(horizonRaw) && horizonRaw > 0 ? horizonRaw : 365
    const userId =
      connection.scope === 'personal' && typeof connection.user === 'object' && connection.user?.id
        ? composioUserUserId(tenantId, connection.user.id)
        : composioTenantUserId(tenantId)

    sources.push({
      label: `tenant ${tenantId} [${calendarId}]${connection.scope === 'personal' ? ' (personal)' : ''}`,
      tenantId,
      connectionId: connection.id,
      calendarId,
      organizerAddress,
      timezone,
      horizonDays,
      fetch: () =>
        fetchUpcomingEventsViaComposio(session.composio, {
          userId,
          calendarId,
          timeMin: new Date(Date.now() - 24 * 3600_000).toISOString(),
          timeMax: new Date(Date.now() + horizonDays * 24 * 3600_000).toISOString(),
        }),
    })
  }

  if (sources.length === 0 && isGcalSyncConfigured()) {
    const tenantSlug = process.env.GCAL_TENANT_SLUG || 'martes'
    const calendarId = process.env.GCAL_CALENDAR_ID || 'primary'
    const organizerAddress = (process.env.GCAL_USER ?? process.env.GMAIL_USER ?? '').toLowerCase()
    const horizonDays = Number(process.env.GCAL_SYNC_HORIZON_DAYS || 365)
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
        label: `legacy env (${tenantSlug}) [${calendarId}]`,
        tenantId: tenant.id,
        connectionId: null,
        calendarId,
        organizerAddress,
        timezone: process.env.GCAL_TIMEZONE ?? 'America/Caracas',
        horizonDays: Number.isFinite(horizonDays) && horizonDays > 0 ? horizonDays : 365,
        fetch: () =>
          listUpcomingEvents({
            calendarId,
            timeMin: new Date(Date.now() - 24 * 3600_000).toISOString(),
            timeMax: new Date(
              Date.now() +
                (Number(process.env.GCAL_SYNC_HORIZON_DAYS || 365) * 24 * 3600_000 || 365 * 24 * 3600_000),
            ).toISOString(),
          }),
      })
    }
  }

  return sources
}

/** Espeja los eventos de una fuente — lógica idéntica al camino legacy. */
async function mirrorSource(payload: Payload, source: GcalSource, events: GcalEventSummary[]): Promise<string> {
  const timeMin = new Date(Date.now() - 24 * 3600_000).toISOString()
  const timeMax = new Date(Date.now() + source.horizonDays * 24 * 3600_000).toISOString()
  const returnedEventIds = new Set(events.map((event) => event.id))

  // Reconciliación de ventana autoritativa: citas en la BD dentro de la
  // ventana que ya no están en la respuesta → canceladas.
  let lastId = 0
  let reconciled = 0
  while (true) {
    const windowRes = await payload.find({
      collection: 'appointments',
      where: {
        and: [
          { tenant: { equals: source.tenantId } },
          source.connectionId
            ? { sourceConnection: { equals: source.connectionId } }
            : { sourceConnection: { exists: false } },
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
    })

    if (windowRes.docs.length === 0) break

    for (const stale of windowRes.docs) {
      lastId = Math.max(lastId, stale.id)
      if (!returnedEventIds.has(stale.gcalEventId)) {
        try {
          await payload.update({
            collection: 'appointments',
            id: stale.id,
            data: { status: 'cancelled' },
            overrideAccess: true,
          })
          reconciled += 1
        } catch (err) {
          payload.logger.error({ msg: 'sync-gcal: error al reconciliar cita obsoleta', id: stale.id, err })
        }
      }
    }

    if (!windowRes.hasNextPage && windowRes.docs.length < 500) break
  }

  if (events.length === 0) {
    source.lastSynced = 0
    return `[${source.label}] sin eventos en la ventana${reconciled > 0 ? ` (${reconciled} obsoletos cancelados)` : ''}`
  }

  // Idempotencia: qué eventos ya están espejados
  const existingRes = await payload.find({
    collection: 'appointments',
    where: {
      and: [
        { tenant: { equals: source.tenantId } },
        source.connectionId
          ? { sourceConnection: { equals: source.connectionId } }
          : { sourceConnection: { exists: false } },
        { gcalEventId: { in: events.map((event) => event.id) } },
      ],
    },
    limit: events.length,
    depth: 0,
    overrideAccess: true,
  })
  const existingByEventId = new Map(existingRes.docs.map((doc) => [doc.gcalEventId, doc.id]))

  // Matching de asistentes → clients/leads del tenant
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

  let synced = 0
  let failed = 0

  for (const event of events) {
    const attendeeEmails = event.attendeeEmails.filter((email) => email !== source.organizerAddress)
    let clientId: number | undefined
    let leadId: number | undefined
    for (const email of attendeeEmails) {
      if (!clientId && clientsByEmail.has(email)) clientId = clientsByEmail.get(email)
      if (!leadId && leadsByEmail.has(email)) leadId = leadsByEmail.get(email)
      if (clientId && leadId) break
    }

    const data = {
      tenant: source.tenantId,
      title: event.summary ?? '(evento sin título)',
      start: event.start,
      endDate: event.end ?? null,
      allDay: event.allDay,
      status: event.status,
      location: event.location ?? null,
      attendees: attendeeEmails.length > 0 ? attendeeEmails.join(', ') : null,
      description: event.description ?? null,
      gcalEventId: event.id,
      ...(source.connectionId ? { sourceConnection: source.connectionId } : {}),
      calendarId: source.calendarId,
      htmlLink: event.htmlLink ?? null,
      client: clientId ?? null,
      lead: leadId ?? null,
    }

    try {
      const existingId = existingByEventId.get(event.id)
      if (existingId) {
        await payload.update({
          collection: 'appointments',
          id: existingId,
          data,
          overrideAccess: true,
        })
      } else {
        await payload.create({
          collection: 'appointments',
          data,
          overrideAccess: true,
        })
      }
      synced += 1
    } catch (err) {
      if (isUniqueConflict(err)) {
        try {
          const conflictDoc = await payload.find({
            collection: 'appointments',
            where: {
              and: [
                { tenant: { equals: source.tenantId } },
                source.connectionId
                  ? { sourceConnection: { equals: source.connectionId } }
                  : { sourceConnection: { exists: false } },
                { gcalEventId: { equals: event.id } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          if (conflictDoc.docs[0]) {
            await payload.update({
              collection: 'appointments',
              id: conflictDoc.docs[0].id,
              data,
              overrideAccess: true,
            })
            existingByEventId.set(event.id, conflictDoc.docs[0].id)
            synced += 1
            continue
          }
        } catch (retryErr) {
          payload.logger.error({ msg: 'sync-gcal: reintento tras conflicto falló', id: event.id, err: retryErr })
        }
      }
      failed += 1
      payload.logger.error({ msg: 'sync-gcal: evento falló', id: event.id, err })
    }
  }

  source.lastSynced = synced
  return `[${source.label}] ${synced} eventos espejados${reconciled > 0 ? ` (${reconciled} obsoletos cancelados)` : ''} (${failed} fallidos) de ${events.length}`
}
