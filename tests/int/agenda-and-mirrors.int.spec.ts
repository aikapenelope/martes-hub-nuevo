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
