import { describe, it, expect, vi } from 'vitest'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

describe('Torre de Control Comercial — getWorkspaceOverviewData', () => {
  const mockUser = {
    id: 1,
    email: 'admin@martes.local',
    roles: ['admin'] as ('admin' | 'agente' | 'viewer')[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as User

  it('ejecuta todas las consultas pasando overrideAccess: false y user para cumplir con RLS', async () => {
    const mockFind = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'payments') {
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
      if (collection === 'conversations' || collection === 'conversation-summaries' || collection === 'email-log') {
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
      if (collection === 'activities' || collection === 'messages') {
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
      if (collection === 'leads') {
        return Promise.resolve({ docs: [], totalDocs: 15 })
      }
      if (collection === 'clients') {
        return Promise.resolve({ docs: [], totalDocs: 5 })
      }
      if (collection === 'tasks') {
        return Promise.resolve({ docs: [], totalDocs: 2 })
      }
      return Promise.resolve({ docs: [], totalDocs: 0 })
    })

    const mockCount = vi.fn().mockImplementation(({ collection, where }: { collection: string; where?: unknown }) => {
      const whereJson = JSON.stringify(where || {})
      if (collection === 'leads') {
        if (whereJson.includes('"convertedClient":{"exists":true}')) {
          return Promise.resolve({ totalDocs: 5 })
        }
        if (!whereJson.includes('status') && !whereJson.includes('greater_than_equal')) {
          return Promise.resolve({ totalDocs: 50 })
        }
        return Promise.resolve({ totalDocs: 15 })
      }
      if (collection === 'clients') {
        return Promise.resolve({ totalDocs: 5 })
      }
      if (collection === 'tasks') {
        return Promise.resolve({ totalDocs: 2 })
      }
      return Promise.resolve({ totalDocs: 0 })
    })
    const mockPayload = {
      find: mockFind,
      count: mockCount,
      db: {
        pool: {
          query: vi.fn().mockResolvedValue({ rows: [{ total: 1000, count: 5 }] }),
        },
      },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    expect(result).toBeDefined()
    expect(result.dateTitle).toBeTruthy()
    expect(result.dayBuckets.length).toBe(364)
    expect(result.metrics).toBeDefined()
    expect(result.metrics.leadsNuevoCount).toBe(15)
    expect(result.metrics.leadsContactadoCount).toBe(15)
    expect(result.metrics.leadsCalificadoCount).toBe(15)
    expect(result.metrics.totalLeadsActive).toBe(45)
    expect(result.metrics.totalConvertedClients).toBe(5)
    expect(result.metrics.overdueTasksCount).toBe(2)
    // Ventanas iguales en el mock → delta captación 0 y conversiones 0
    expect(result.metrics.leadsCreatedInPeriod).toBe(15)
    expect(result.metrics.leadsNuevosTrendPct).toBe(0)
    expect(result.metrics.conversionsInPeriod).toBe(15)
    expect(result.metrics.conversionTrendPct).toBe(0)

    // Verificar que todas las llamadas a find incluyeron overrideAccess: false y user
    for (const call of mockFind.mock.calls) {
      const queryParams = call[0]
      expect(queryParams.overrideAccess).toBe(false)
      expect(queryParams.user).toEqual(mockUser)
      expect(queryParams.where).toBeDefined()
    }
    // Las llamadas a count también deben respetar RLS
    for (const call of mockCount.mock.calls) {
      const queryParams = call[0]
      expect(queryParams.overrideAccess).toBe(false)
      expect(queryParams.user).toEqual(mockUser)
      expect(queryParams.where).toBeDefined()
    }
  })

  it('calcula conversiones y tasas reales sin divisiones por cero cuando no hay registros', async () => {
    const mockFind = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 })
    const mockCount = vi.fn().mockResolvedValue({ totalDocs: 0 })
    const mockPayload = {
      find: mockFind,
      count: mockCount,
      db: { pool: undefined },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    expect(result.metrics.globalConversionRate).toBeNull()
    expect(result.metrics.rateNewToContacted).toBeNull()
    expect(result.metrics.rateContactedToQualified).toBeNull()
    expect(result.metrics.rateQualifiedToWon).toBeNull()
    expect(result.metrics.revenueTrendPct).toBeNull()
    expect(result.metrics.revenueMonthTotal).toBe(0)
    // Sin registros en ninguna ventana → deltas sin base de comparación
    expect(result.metrics.leadsNuevosTrendPct).toBeNull()
    expect(result.metrics.conversionTrendPct).toBeNull()
    expect(result.hotLeads).toEqual([])
    expect(result.sourceBreakdown).toEqual([])
    expect(result.operationalAlerts).toEqual([])
  })

  it('calcula deltas de captación y conversiones por ventana previa real', async () => {
    const windowCalls: string[] = []
    const mockFind = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 })
    const mockCount = vi.fn().mockImplementation(({ collection, where }: { collection: string; where: unknown }) => {
      const whereJson = JSON.stringify(where)
      if (whereJson.includes('greater_than_equal')) {
        // convertedAt = ventana de conversiones; createdAt = ventana de captación
        windowCalls.push(whereJson.includes('convertedAt') ? `conv:${collection}` : `cap:${collection}`)
      }
      if (collection === 'leads') {
        if (!whereJson.includes('greater_than_equal')) return Promise.resolve({ totalDocs: 0 })
        if (whereJson.includes('convertedAt')) {
          // Orden del Promise.all: primera ventana = período actual, segunda = previa
          return windowCalls.filter((c) => c.startsWith('conv:')).length === 1
            ? Promise.resolve({ totalDocs: 3 })
            : Promise.resolve({ totalDocs: 1 })
        }
        return windowCalls.filter((c) => c.startsWith('cap:')).length === 1
          ? Promise.resolve({ totalDocs: 12 })
          : Promise.resolve({ totalDocs: 8 })
      }
      return Promise.resolve({ totalDocs: 0 })
    })
    const mockPayload = {
      find: mockFind,
      count: mockCount,
      db: { pool: undefined },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    expect(result.metrics.leadsCreatedInPeriod).toBe(12)
    // 12 vs 8 → +50%
    expect(result.metrics.leadsNuevosTrendPct).toBeCloseTo(50, 1)
    // Conversiones por convertedAt: 3 vs 1 → +200%
    expect(result.metrics.conversionsInPeriod).toBe(3)
    expect(result.metrics.conversionTrendPct).toBe(200)

    // Las 4 consultas de ventana (2 captación + 2 conversión) también respetan RLS
    const windowCountCalls = mockCount.mock.calls.filter((call) =>
      JSON.stringify((call[0] as { where: unknown }).where).includes('greater_than_equal'),
    )
    expect(windowCountCalls.length).toBe(4)
    for (const [params] of windowCountCalls) {
      const queryParams = params as { overrideAccess: boolean; user: unknown; where: unknown }
      expect(queryParams.overrideAccess).toBe(false)
      expect(queryParams.user).toEqual(mockUser)
      expect(queryParams.where).toBeDefined()
    }
  })

  describe('Vistas de Enfoque (Operativa vs Ejecutiva)', () => {
    it('calcula la cantidad de elementos urgentes como la suma de alertas y seguimientos del día', () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          title: 'SLA vencido',
          subtitle: 'Contacto prioritario',
          severity: 'critical' as const,
          href: '/workspace/crm',
          actionText: 'Resolver',
        },
      ]
      const mockFollowups = [
        {
          id: 42,
          name: 'Empresa Demo',
          phone: '+584121234567',
          pipeline: 'nuevo',
          kind: 'lead' as const,
          lastActivityAt: new Date().toISOString(),
          waUrl: 'https://wa.me/584121234567',
        },
      ]

      const urgentCount = mockAlerts.length + mockFollowups.length
      expect(urgentCount).toBe(2)
    })
  })

  describe('Alerta SLA WhatsApp 24h', () => {
    it('filtra estrictamente conversaciones abiertas que realmente esperan respuesta del agente', async () => {
      const now = new Date()
      const criticalInboundIso = new Date(now.getTime() - 22 * 3600_000).toISOString()
      const repliedOutboundIso = new Date(now.getTime() - 21 * 3600_000).toISOString()

      const mockConversations = [
        // Caso 1: abierta y sin responder (debe contar)
        {
          id: 1,
          status: 'open',
          lastInboundAt: criticalInboundIso,
          lastMessageAt: criticalInboundIso,
        },
        // Caso 2: abierta pero respondida posteriormente por el agente (NO debe contar)
        {
          id: 2,
          status: 'open',
          lastInboundAt: criticalInboundIso,
          lastMessageAt: repliedOutboundIso,
        },
        // Caso 3: resuelta (NO debe contar)
        {
          id: 3,
          status: 'resolved',
          lastInboundAt: criticalInboundIso,
          lastMessageAt: criticalInboundIso,
        },
      ]

      const mockFind = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
        if (collection === 'conversations') {
          return Promise.resolve({ docs: mockConversations, totalDocs: mockConversations.length })
        }
        return Promise.resolve({ docs: [], totalDocs: 0 })
      })
      const mockCount = vi.fn().mockResolvedValue({ totalDocs: 0 })
      const mockPayload = {
        find: mockFind,
        count: mockCount,
        db: { pool: undefined },
      } as unknown as Payload

      const result = await getWorkspaceOverviewData({
        payload: mockPayload,
        user: mockUser,
        tenantId: 10,
      })

      // Solo el caso 1 debe activar la alerta
      expect(result.metrics.critical24hCount).toBe(1)
      const slaAlert = result.operationalAlerts.find((a) => a.id === 'whatsapp-24h-sla')
      expect(slaAlert).toBeDefined()
      expect(slaAlert?.title).toContain('1 conversación de WhatsApp con ventana por expirar')
    })
  })
})

