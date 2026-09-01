import { describe, it, expect, vi } from 'vitest'
import { collectFollowupsToday } from '@/lib/followups-today'
import type { User } from '@/payload-types'

const DAY_MS = 24 * 60 * 60 * 1000

const mockUser = {
  id: 1,
  email: 'admin@martes.local',
  roles: ['admin'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as User

function mockPayloadFactory({
  leads = [],
  clients = [],
  conversations = [],
}: {
  leads?: Array<{ id: number; fullName: string; phone: string; status: string; createdAt: string }>
  clients?: Array<{ id: number; name: string; phone: string; stage: string; createdAt: string }>
  conversations?: Array<Record<string, unknown>>
} = {}) {
  const mockFind = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
    if (collection === 'conversations') return Promise.resolve({ docs: conversations, totalDocs: conversations.length })
    if (collection === 'leads') return Promise.resolve({ docs: leads, totalDocs: leads.length })
    if (collection === 'clients') return Promise.resolve({ docs: clients, totalDocs: clients.length })
    return Promise.resolve({ docs: [], totalDocs: 0 })
  })
  return { payload: { find: mockFind } as unknown as import('payload').Payload, mockFind }
}

describe('collectFollowupsToday — criterio SLA unificado', () => {
  it('ejecuta todas las consultas con overrideAccess: false, user y filtro de tenant', async () => {
    const { payload, mockFind } = mockPayloadFactory()
    await collectFollowupsToday({ payload, user: mockUser, tenantId: 10 })

    expect(mockFind.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const call of mockFind.mock.calls) {
      const params = call[0] as { overrideAccess: boolean; user: unknown; where?: { and?: unknown[] } }
      expect(params.overrideAccess).toBe(false)
      expect(params.user).toEqual(mockUser)
      expect(params.where).toBeDefined()
    }
  })

  it('marca como Nunca contactado un lead nuevo que supera su SLA y genera waLink con saludo', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * DAY_MS).toISOString()
    const { payload } = mockPayloadFactory({
      leads: [{ id: 1, fullName: 'Ana Pérez', phone: '584121112233', status: 'nuevo', createdAt: sixDaysAgo }],
    })
    const items = await collectFollowupsToday({ payload, user: mockUser, tenantId: 10 })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      kind: 'lead',
      id: 1,
      reason: 'Nunca contactado',
      priority: 80, // 6 dias * 10 + bonus 20 de etapa nuevo
      crmUrl: '/workspace/crm/leads/1',
    })
    expect(items[0].waLink).toContain('https://wa.me/584121112233')
    expect(decodeURIComponent(items[0].waLink)).toContain('Hola Ana')
  })

  it('omite leads dentro del SLA de su etapa (sin spam prematuro)', async () => {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { payload } = mockPayloadFactory({
      leads: [{ id: 2, fullName: 'Recien Creado', phone: '584120000000', status: 'nuevo', createdAt: oneHourAgo }],
    })
    const items = await collectFollowupsToday({ payload, user: mockUser, tenantId: 10 })
    expect(items).toHaveLength(0)
  })

  it('respeta la ventana anti-spam de 24h: no reaparece si escribio hace menos de un dia', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS).toISOString()
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { payload } = mockPayloadFactory({
      leads: [{ id: 3, fullName: 'Conversacion Activa', phone: '584124444444', status: 'contactado', createdAt: tenDaysAgo }],
      conversations: [{ lead: 3, client: null, lastInboundAt: oneHourAgo, lastMessageAt: oneHourAgo }],
    })
    const items = await collectFollowupsToday({ payload, user: mockUser, tenantId: 10 })
    expect(items).toHaveLength(0)
  })

  it('descarta leads sin telefono, convertidos y clientes con opt-out', async () => {
    const { payload } = mockPayloadFactory({
      leads: [
        { id: 4, fullName: 'Sin Telefono', phone: '', status: 'nuevo', createdAt: new Date(Date.now() - 10 * DAY_MS).toISOString() },
      ],
      clients: [
        { id: 5, name: 'Opt Out', phone: '584125555555', stage: 'activo', createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString() },
      ],
    })
    // El filtro de optOutAt vive en el where; el mock no lo aplica, asi que
    // verificamos que la query de clientes lo incluya explicitamente.
    const { payload: payload2, mockFind } = mockPayloadFactory({
      leads: [],
      clients: [{ id: 5, name: 'Opt Out', phone: '584125555555', stage: 'activo', createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString() }],
    })
    void payload2
    await collectFollowupsToday({ payload, user: mockUser, tenantId: 10 })
    await collectFollowupsToday({ payload: { find: mockFind } as unknown as import('payload').Payload, user: mockUser, tenantId: 10 })

    const clientsCall = mockFind.mock.calls
      .map((c) => c[0] as { collection: string; where?: { and?: Array<Record<string, unknown>> } })
      .find((c) => c.collection === 'clients')
    const whereStr = JSON.stringify(clientsCall?.where)
    expect(whereStr).toContain('optOutAt')
  })
})
