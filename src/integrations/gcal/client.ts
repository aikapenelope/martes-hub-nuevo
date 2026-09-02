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

export function parseAllDayDate(dateStr: string, timeZone = 'America/Caracas'): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date(dateStr).toISOString()
  const approx = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(approx)
  const tzOffsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT-4'
  const match = tzOffsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/)
  let offsetStr = '-04:00'
  if (match) {
    const sign = match[1]
    const hours = match[2].padStart(2, '0')
    const minutes = (match[3] || '00').padStart(2, '0')
    offsetStr = `${sign}${hours}:${minutes}`
  }
  return new Date(`${dateStr}T00:00:00${offsetStr}`).toISOString()
}

export async function listUpcomingEvents(options: {
  calendarId?: string
  timeMin: string
  timeMax: string
  maxResults?: number
  timeZone?: string
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
  let calendarTimeZone: string | undefined

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
      timeZone?: string
    }

    if (data.timeZone && !calendarTimeZone) {
      calendarTimeZone = data.timeZone
    }

    if (data.items?.length) {
      rawItems.push(...data.items)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  const effectiveTimeZone =
    options.timeZone || calendarTimeZone || process.env.GCAL_TIMEZONE || 'America/Caracas'

  return rawItems.map((event) => {
    const allDay = Boolean(event.start?.date && !event.start?.dateTime)
    const startIso = event.start?.dateTime
      ? new Date(event.start.dateTime).toISOString()
      : event.start?.date
        ? parseAllDayDate(event.start.date, effectiveTimeZone)
        : new Date().toISOString()
    const endIso = event.end?.dateTime
      ? new Date(event.end.dateTime).toISOString()
      : event.end?.date
        ? parseAllDayDate(event.end.date, effectiveTimeZone)
        : startIso
    const status =
      event.status === 'cancelled' ? 'cancelled' : event.status === 'tentative' ? 'tentative' : 'confirmed'

    return {
      id: event.id,
      summary: event.summary ?? null,
      description: event.description ?? null,
      location: event.location ?? null,
      htmlLink: event.htmlLink ?? null,
      status: status as GcalEventSummary['status'],
      start: startIso,
      end: endIso,
      allDay,
      attendeeEmails: (event.attendees ?? [])
        .map((a) => (a.email ?? '').toLowerCase())
        .filter((email) => email.includes('@')),
    }
  })
}
