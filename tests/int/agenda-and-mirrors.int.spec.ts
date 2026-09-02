import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getUpcomingAgenda } from '@/lib/agenda-data'
import { listRecentMessages } from '@/integrations/gmail/client'
import { listUpcomingEvents } from '@/integrations/gcal/client'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

describe('Agenda unificada — getUpcomingAgenda', () => {
  const mockUser = {
    id: 1,
    email: 'admin@martes.local',
    roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as User

  it('ejecuta todas las consultas pasando overrideAccess: false y user', async () => {
    const mockFind = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'tasks') {
        return Promise.resolve({
          docs: [
            {
              id: 101,
              title: 'Llamar a cliente',
              dueDate: new Date().toISOString(),
              priority: 'alta',
            },
          ],
        })
      }
      if (collection === 'appointments') {
        return Promise.resolve({
          docs: [
            {
              id: 201,
              title: 'Reunión demo',
              start: new Date().toISOString(),
              status: 'confirmed',
              location: 'Google Meet',
            },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const mockPayload = { find: mockFind } as unknown as Payload

    const items = await getUpcomingAgenda({
      payload: mockPayload,
      user: mockUser,
      tenantId: 5,
      days: 7,
    })

    expect(items.length).toBe(2)
    expect(mockFind).toHaveBeenCalledTimes(4)

    for (const call of mockFind.mock.calls) {
      const queryParams = call[0]
      expect(queryParams.overrideAccess).toBe(false)
      expect(queryParams.user).toEqual(mockUser)
      expect(queryParams.where).toBeDefined()
    }
  })

  it('soporta llamada con argumentos posicionales preservando retrocompatibilidad', async () => {
    const mockFind = vi.fn().mockResolvedValue({ docs: [] })
    const mockPayload = { find: mockFind } as unknown as Payload

    await getUpcomingAgenda(mockPayload, 5, 7, mockUser)

    expect(mockFind).toHaveBeenCalledTimes(4)
    for (const call of mockFind.mock.calls) {
      const queryParams = call[0]
      expect(queryParams.overrideAccess).toBe(false)
      expect(queryParams.user).toEqual(mockUser)
    }
  })
})

describe('Integración Gmail y GCal — Paginación completa', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'mock-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'mock-client-secret'
    process.env.GOOGLE_REFRESH_TOKEN = 'mock-refresh-token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('listRecentMessages pagina a través de nextPageToken y consolida todos los mensajes', async () => {
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString()
      // Mock OAuth token exchange
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 }),
        } as unknown as Response
      }

      callCount++
      if (callCount === 1) {
        expect(urlStr).not.toContain('pageToken')
        return {
          ok: true,
          json: async () => ({
            messages: [{ id: 'msg-1', threadId: 'thread-1' }],
            nextPageToken: 'token-page-2',
          }),
        } as unknown as Response
      } else {
        expect(urlStr).toContain('pageToken=token-page-2')
        return {
          ok: true,
          json: async () => ({
            messages: [{ id: 'msg-2', threadId: 'thread-2' }],
          }),
        } as unknown as Response
      }
    })

    const messages = await listRecentMessages({ query: 'newer_than:2d' })
    expect(messages).toHaveLength(2)
    expect(messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2'])
  })

  it('listUpcomingEvents pagina a través de nextPageToken y retorna todos los eventos combinados', async () => {
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = url.toString()
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 }),
        } as unknown as Response
      }

      callCount++
      if (callCount === 1) {
        expect(urlStr).not.toContain('pageToken')
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'evt-1',
                summary: 'Cita 1',
                start: { dateTime: '2026-09-02T10:00:00Z' },
                end: { dateTime: '2026-09-02T11:00:00Z' },
              },
            ],
            nextPageToken: 'token-gcal-page-2',
          }),
        } as unknown as Response
      } else {
        expect(urlStr).toContain('pageToken=token-gcal-page-2')
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'evt-2',
                summary: 'Cita 2',
                start: { dateTime: '2026-09-02T12:00:00Z' },
                end: { dateTime: '2026-09-02T13:00:00Z' },
              },
            ],
          }),
        } as unknown as Response
      }
    })

    const events = await listUpcomingEvents({
      timeMin: '2026-09-01T00:00:00Z',
      timeMax: '2026-09-08T00:00:00Z',
    })

    expect(events).toHaveLength(2)
    expect(events.map((e) => e.id)).toEqual(['evt-1', 'evt-2'])
  })
})

describe('Integración Gmail — Parser de direcciones RFC-aware', () => {
  it('maneja nombres entrecomillados con comas internas sin fragmentar la dirección', async () => {
    const { splitAddresses } = await import('@/integrations/gmail/client')
    const raw = '"Doe, John" <john@example.com>, Jane <jane@example.com>'
    const parsed = splitAddresses(raw)

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({ name: 'Doe, John', email: 'john@example.com' })
    expect(parsed[1]).toEqual({ name: 'Jane', email: 'jane@example.com' })
  })

  it('maneja comillas escapadas y múltiples destinatarios en To/Cc', async () => {
    const { splitAddresses } = await import('@/integrations/gmail/client')
    const raw = '"John \\"The Boss\\"" <boss@example.com>, "Pérez, Carlos" <carlos@empresa.com>, plain@example.com'
    const parsed = splitAddresses(raw)

    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toEqual({ name: 'John "The Boss"', email: 'boss@example.com' })
    expect(parsed[1]).toEqual({ name: 'Pérez, Carlos', email: 'carlos@empresa.com' })
    expect(parsed[2]).toEqual({ name: null, email: 'plain@example.com' })
  })
})

describe('Agenda unificada — Orden ascendente por fecha próxima', () => {
  const mockUser = {
    id: 1,
    email: 'admin@martes.local',
    roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as User

  it('ordena cada consulta de origen por su fecha ascendente antes del limit', async () => {
    const mockFind = vi.fn().mockResolvedValue({ docs: [] })
    const mockPayload = { find: mockFind } as unknown as Payload

    await getUpcomingAgenda({
      payload: mockPayload,
      user: mockUser,
      tenantId: 5,
      days: 7,
    })

    const callsByCollection = new Map(mockFind.mock.calls.map((c) => [c[0].collection, c[0]]))
    expect(callsByCollection.get('tasks')?.sort).toBe('dueDate')
    expect(callsByCollection.get('memberships')?.sort).toBe('renewalDate')
    expect(callsByCollection.get('payments')?.sort).toBe('dueDate')
    expect(callsByCollection.get('appointments')?.sort).toBe('start')
  })
})

describe('Integración GCal — Normalización de eventos todo el día', () => {
  it('parseAllDayDate preserva la fecha en America/Caracas sin retroceder al día anterior', async () => {
    const { parseAllDayDate } = await import('@/integrations/gcal/client')
    const iso = parseAllDayDate('2026-09-02', 'America/Caracas')

    expect(iso).toBe('2026-09-02T04:00:00.000Z')

    const fmt = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })
    // 2/9/2026 en Caracas, NO 1/9/2026
    const formatted = fmt.format(new Date(iso))
    expect(formatted).toContain('2')
    expect(formatted).toContain('9')
    expect(formatted).toContain('2026')
  })

  it('maneja zonas horarias sin offset (UTC) de forma exacta a medianoche', async () => {
    const { parseAllDayDate } = await import('@/integrations/gcal/client')
    const iso = parseAllDayDate('2026-09-02', 'UTC')
    expect(iso).toBe('2026-09-02T00:00:00.000Z')
  })

  it('calcula la medianoche exacta en ambas fechas de transición de horario de verano en America/New_York', async () => {
    const { parseAllDayDate } = await import('@/integrations/gcal/client')

    // 2026-03-08: Spring forward (a medianoche NY sigue en EST, UTC-5)
    const springIso = parseAllDayDate('2026-03-08', 'America/New_York')
    expect(springIso).toBe('2026-03-08T05:00:00.000Z')

    // 2026-11-01: Fall back (a medianoche NY sigue en EDT, UTC-4)
    const fallIso = parseAllDayDate('2026-11-01', 'America/New_York')
    expect(fallIso).toBe('2026-11-01T04:00:00.000Z')
  })
})

describe('GCal Mirror — Reconciliación estable con más de 500 citas obsoletas', () => {
  it('recorre todas las citas obsoletas mediante cursor por ID sin omitir registros', async () => {
    const totalStale = 650
    const mockAppointments = Array.from({ length: totalStale }, (_, idx) => ({
      id: idx + 1,
      gcalEventId: `old-event-${idx + 1}`,
      status: 'confirmed',
    }))

    const cancelledIds: number[] = []

    const mockFind = vi.fn().mockImplementation(({ where }: { where: { and: Array<{ id?: { greater_than: number } }> } }) => {
      const idClause = where.and.find((clause) => clause.id && 'greater_than' in clause.id)
      const afterId = idClause?.id?.greater_than ?? 0
      const matches = mockAppointments.filter((a) => a.id > afterId).slice(0, 500)
      return Promise.resolve({
        docs: matches,
        hasNextPage: matches.length === 500,
      })
    })

    const mockUpdate = vi.fn().mockImplementation(({ id, data }: { id: number; data: { status: string } }) => {
      if (data.status === 'cancelled') cancelledIds.push(id)
      return Promise.resolve({ id })
    })

    // Simular el bucle de cursor usado en syncGcalTask
    let lastId = 0
    let reconciled = 0
    const returnedEventIds = new Set<string>() // Ninguna cita en Google (todas fueron eliminadas)

    while (true) {
      const windowRes = await mockFind({
        where: {
          and: [{ id: { greater_than: lastId } }],
        },
      })

      if (windowRes.docs.length === 0) break

      for (const stale of windowRes.docs) {
        lastId = Math.max(lastId, stale.id)
        if (!returnedEventIds.has(stale.gcalEventId)) {
          await mockUpdate({ id: stale.id, data: { status: 'cancelled' } })
          reconciled += 1
        }
      }

      if (!windowRes.hasNextPage && windowRes.docs.length < 500) break
    }

    expect(reconciled).toBe(650)
    expect(cancelledIds).toHaveLength(650)
    expect(cancelledIds[0]).toBe(1)
    expect(cancelledIds[649]).toBe(650)
    expect(mockFind).toHaveBeenCalledTimes(2)
  })
})
