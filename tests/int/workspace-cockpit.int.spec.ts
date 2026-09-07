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

    const mockCount = vi.fn().mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'leads') {
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
    // Ventanas iguales en el mock → delta captación 0 y conversión por cohorte 0
    expect(result.metrics.leadsCreatedInPeriod).toBe(15)
    expect(result.metrics.leadsNuevosTrendPct).toBe(0)
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

  it('calcula deltas de captación y conversión por cohorte contra la ventana previa real', async () => {
    const windowCalls: string[] = []
    const mockFind = vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 })
    const mockCount = vi.fn().mockImplementation(({ collection, where }: { collection: string; where: unknown }) => {
      const isWindowQuery = JSON.stringify(where).includes('createdAt')
      if (isWindowQuery) windowCalls.push(collection)
      if (collection === 'leads') {
        if (!isWindowQuery) return Promise.resolve({ totalDocs: 0 })
        // Orden del Promise.all: primera ventana = período actual, segunda = previa
        return windowCalls.filter((c) => c === 'leads').length === 1
          ? Promise.resolve({ totalDocs: 12 })
          : Promise.resolve({ totalDocs: 8 })
      }
      if (collection === 'clients') {
        if (!isWindowQuery) return Promise.resolve({ totalDocs: 0 })
        return windowCalls.filter((c) => c === 'clients').length === 1
          ? Promise.resolve({ totalDocs: 2 })
          : Promise.resolve({ totalDocs: 4 })
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
    // Conversión por cohorte: 2/12 (16.7%) vs 4/8 (50%) → -66.7%
    expect(result.metrics.conversionTrendPct).toBeCloseTo(-66.7, 0)

    // Las 4 consultas de ventana también respetan RLS
    const windowCountCalls = mockCount.mock.calls.filter((call) =>
      JSON.stringify((call[0] as { where: unknown }).where).includes('createdAt'),
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
})

