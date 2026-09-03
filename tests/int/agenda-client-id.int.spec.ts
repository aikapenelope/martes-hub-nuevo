import { describe, it, expect, vi } from 'vitest'
import { getUpcomingAgenda } from '@/lib/agenda-data'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

describe('getUpcomingAgenda — vínculo cliente/lead de las citas', () => {
  const mockUser = {
    id: 1,
    email: 'admin@martes.local',
    roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as User

  function mockPayload(appointments: unknown[]): Payload {
    return {
      find: vi.fn().mockImplementation(({ collection }: { collection: string }) => {
        if (collection === 'appointments') return Promise.resolve({ docs: appointments })
        return Promise.resolve({ docs: [] })
      }),
    } as unknown as Payload
  }

  it('cita con cliente Y lead: expone clientId (el cliente es el vínculo principal)', async () => {
    const items = await getUpcomingAgenda({
      payload: mockPayload([
        {
          id: 201,
          title: 'Reunión demo',
          start: new Date().toISOString(),
          status: 'confirmed',
          client: { id: 7, name: 'Acme' },
          lead: { id: 9, fullName: 'Juan Pérez' },
        },
      ]),
      user: mockUser,
      tenantId: 5,
      days: 7,
    })

    const cita = items.find((i) => i.type === 'cita')
    expect(cita).toBeDefined()
    expect(cita?.clientId).toBe(7)
    expect(cita?.leadId).toBe(9)
  })

  it('cita solo con lead (sin cliente): clientId queda indefinido y leadId presente', async () => {
    const items = await getUpcomingAgenda({
      payload: mockPayload([
        {
          id: 202,
          title: 'Visita prospecto',
          start: new Date().toISOString(),
          status: 'confirmed',
          client: null,
          lead: { id: 9, fullName: 'Juan Pérez' },
        },
      ]),
      user: mockUser,
      tenantId: 5,
      days: 7,
    })

    const cita = items.find((i) => i.type === 'cita')
    expect(cita).toBeDefined()
    expect(cita?.leadId).toBe(9)
    expect(cita?.clientId).toBeUndefined()
  })
})
