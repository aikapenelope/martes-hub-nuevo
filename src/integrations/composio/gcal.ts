import type { Composio } from '@composio/core'

import type { GcalEventSummary } from '../gcal/client'
import { executeTool } from './client'

/**
 * Adapter Google Calendar vía Composio — devuelve el MISMO shape
 * (`GcalEventSummary`) que el cliente env-based, así que el job `sync-gcal`
 * mantiene su reconciliación de ventana y matching de asistentes intactos.
 *
 * Acción: GOOGLECALENDAR_EVENTS_LIST (calendarId/timeMin/timeMax camelCase,
 * showDeleted para traer cancelados y marcarlos en la BD).
 */

function attendeeEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((attendee) => {
      if (!attendee || typeof attendee !== 'object') return null
      const email = (attendee as { email?: unknown }).email
      return typeof email === 'string' ? email : null
    })
    .filter((email): email is string => Boolean(email))
}

function eventTimestamp(value: unknown): { iso: string; allDay: boolean } | null {
  if (!value || typeof value !== 'object') return null
  const item = value as { dateTime?: string; date?: string }
  if (typeof item.dateTime === 'string') return { iso: item.dateTime, allDay: false }
  if (typeof item.date === 'string') return { iso: item.date, allDay: true }
  return null
}

/** Normaliza un evento crudo de Composio/GCal a GcalEventSummary. */
export function normalizeGcalEvent(raw: unknown): GcalEventSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>

  const id = typeof item.id === 'string' ? item.id : null
  const start = eventTimestamp(item.start)
  if (!id || !start) return null

  const statusRaw = typeof item.status === 'string' ? item.status : 'confirmed'
  const status: GcalEventSummary['status'] =
    statusRaw === 'cancelled' ? 'cancelled' : statusRaw === 'tentative' ? 'tentative' : 'confirmed'
  const end = eventTimestamp(item.end)

  return {
    id,
    summary: typeof item.summary === 'string' ? item.summary : null,
    description: typeof item.description === 'string' ? item.description : null,
    location: typeof item.location === 'string' ? item.location : null,
    htmlLink: typeof item.htmlLink === 'string' ? item.htmlLink : null,
    status,
    start: start.iso,
    end: end?.iso ?? start.iso,
    allDay: start.allDay,
    attendeeEmails: attendeeEmails(item.attendees),
  }
}

/** Trae los eventos de la ventana [timeMin, timeMax] del calendario de la conexión. */
export async function fetchUpcomingEventsViaComposio(
  composio: Composio,
  options: { userId: string; calendarId: string; timeMin: string; timeMax: string },
): Promise<GcalEventSummary[]> {
  const result = await executeTool<{ data?: string; successful?: boolean }>(composio, {
    toolkit: 'googlecalendar',
    slug: 'GOOGLECALENDAR_EVENTS_LIST',
    userId: options.userId,
    args: {
      calendarId: options.calendarId,
      timeMin: options.timeMin,
      timeMax: options.timeMax,
      showDeleted: true,
      singleEvents: true,
      maxResults: 500,
    },
  })

  let parsed: unknown = {}
  try {
    parsed = JSON.parse(result?.data ?? '{}')
  } catch {
    parsed = {}
  }
  const container = parsed as { items?: unknown[] }
  const rawEvents = Array.isArray(container.items) ? container.items : []

  return rawEvents
    .map(normalizeGcalEvent)
    .filter((event): event is GcalEventSummary => event !== null)
}
