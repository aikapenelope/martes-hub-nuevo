/**
 * Cliente Google Calendar de SOLO LECTURA (Fase C).
 *
 * Sustrae las citas del calendario configurado y las mete en el CRM en
 * `appointments` vía el job `sync-gcal` — el que el README ya documentaba.
 * La creación de citas sigue viva en el agente de OpenBSP: aquí solo se
 * espeja lo que ya quedó en el calendario, sin escribir nunca en GCal.
 *
 * Autenticación: refresh token offline compartido (google/token.ts), scope
 * calendar.readonly. Sin dependencias nuevas (REST directo).
 */

import { areGoogleCredentialsConfigured, getGoogleAccessToken } from '../google/token'

const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars'

export function isGcalSyncConfigured(): boolean {
  return Boolean(process.env.GCAL_SYNC_ENABLED === 'true' && areGoogleCredentialsConfigured())
}

export interface GcalEventSummary {
  id: string
  summary: string | null
  description: string | null
  location: string | null
  htmlLink: string | null
  status: 'confirmed' | 'tentative' | 'cancelled'
  start: string
  end: string
  allDay: boolean
  attendeeEmails: string[]
}

export async function listUpcomingEvents(options: {
  calendarId?: string
  timeMin: string
  timeMax: string
  maxResults?: number
}): Promise<GcalEventSummary[]> {
  const token = await getGoogleAccessToken()
  const calendarId = encodeURIComponent(options.calendarId || 'primary')

  const rawItems: Array<{
    id: string
    summary?: string
    description?: string
    location?: string
    htmlLink?: string
    status?: string
    start?: { dateTime?: string; date?: string }
    end?: { dateTime?: string; date?: string }
    attendees?: { email?: string }[]
  }> = []

  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(Math.min(options.maxResults ?? 250, 250)),
      showDeleted: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${CAL_API}/${calendarId}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`GCal list falló (${res.status}): ${(await res.text()).slice(0, 300)}`)
    }

    const data = (await res.json()) as {
      items?: typeof rawItems
      nextPageToken?: string
    }

    if (data.items?.length) {
      rawItems.push(...data.items)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return rawItems.map((event) => {
    const startIso = event.start?.dateTime ?? event.start?.date
    const endIso = event.end?.dateTime ?? event.end?.date
    const allDay = Boolean(event.start?.date && !event.start?.dateTime)
    const status =
      event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed'

    return {
      id: event.id,
      summary: event.summary ?? null,
      description: event.description ?? null,
      location: event.location ?? null,
      htmlLink: event.htmlLink ?? null,
      status: status as GcalEventSummary['status'],
      start: startIso ?? new Date().toISOString(),
      end: endIso ?? startIso ?? new Date().toISOString(),
      allDay,
      attendeeEmails: (event.attendees ?? [])
        .map((a) => (a.email ?? '').toLowerCase())
        .filter((email) => email.includes('@')),
    }
  })
}
