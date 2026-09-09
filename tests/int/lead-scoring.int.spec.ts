import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { computeLeadScore, scoreTenantLeads } from '@/lib/lead-scoring'
import { recalculateLeadScoresTask } from '@/jobs/leadScoring'

const NOW = Date.parse('2026-09-08T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const daysAgoIso = (days: number): string => new Date(NOW - days * DAY_MS).toISOString()

describe('computeLeadScore — fórmula de scoring', () => {
  it('lead con inbound reciente, sentimiento positivo, llamadas y decisor → caliente/alta', () => {
    const result = computeLeadScore(
      {
        status: 'contactado',
        createdAt: daysAgoIso(10),
        lastInboundAt: daysAgoIso(0.1),
        lastMessageAt: daysAgoIso(0.1),
        numeroDeLlamadas: 2,
        pudoHablarDecisor: true,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 30 (inbound ≤24h) + 25 (positivo) + 10 (2 llamadas) + 10 (decisor) + 10 (etapa)
    expect(result.score).toBe(85)
    expect(result.nivelInteres).toBe('caliente')
    expect(result.prioridad).toBe('alta')
  })

  it('sentimiento positivo sin inbound y sin llamadas → templado/baja', () => {
    const result = computeLeadScore(
      {
        status: 'contactado',
        createdAt: daysAgoIso(5),
        lastInboundAt: null,
        lastMessageAt: daysAgoIso(3.5),
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 25 (positivo) + 10 (etapa); SLA: 3 días desde último mensaje, sin exceso
    expect(result.score).toBe(35)
    expect(result.nivelInteres).toBe('templado')
    expect(result.prioridad).toBe('baja')
  })

  it('lead nuevo sin señales → frio/baja', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(0.2),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(result.score).toBe(5)
    expect(result.nivelInteres).toBe('frio')
    expect(result.prioridad).toBe('baja')
  })

  it('SLA vencido penaliza −10 por cada 2 días de exceso y el score no baja de 0', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(8),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    // 5 (nuevo) − 10·⌊(8−2)/2⌋ = 5 − 30 → piso 0
    expect(result.score).toBe(0)
    expect(result.nivelInteres).toBe('frio')
    expect(result.prioridad).toBe('baja')
  })

  it('sentimiento en_riesgo resta puntos', () => {
    const result = computeLeadScore(
      {
        status: 'calificado',
        createdAt: daysAgoIso(2),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'en_riesgo',
      },
      NOW,
    )
    // −15 (en_riesgo) + 15 (calificado, dentro de SLA de 7 días)
    expect(result.score).toBe(0)
    expect(result.nivelInteres).toBe('frio')
  })

  it('frontera exacta de caliente en 60 → caliente/media', () => {
    const result = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(0),
        lastInboundAt: daysAgoIso(0.5),
        lastMessageAt: daysAgoIso(0.5),
        numeroDeLlamadas: 0,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: 'positivo',
      },
      NOW,
    )
    // 30 (inbound) + 25 (positivo) + 5 (nuevo)
    expect(result.score).toBe(60)
    expect(result.nivelInteres).toBe('caliente')
    expect(result.prioridad).toBe('media')
  })

  it('llamadas negativas se tratan como cero y 4+ saturan en +15', () => {
    const bajo = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(1),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: -2,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(bajo.score).toBe(5)

    const saturado = computeLeadScore(
      {
        status: 'nuevo',
        createdAt: daysAgoIso(1),
        lastInboundAt: null,
        lastMessageAt: null,
        numeroDeLlamadas: 9,
        pudoHablarDecisor: false,
        visitadoPresencialmente: false,
        sentiment: null,
      },
      NOW,
    )
    expect(saturado.score).toBe(20)
  })
})

interface PageResult {
  docs: Record<string, unknown>[]
  hasNextPage: boolean
}

interface TenantLeadsMocks {
  payload: Payload
  find: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  queue: ReturnType<typeof vi.fn>
}

interface MockExtras {
  conversationsPages?: PageResult[]
  summariesPages?: PageResult[]
  tenantsPages?: PageResult[]
}

function buildMockPayload(lead: Record<string, unknown>, extras?: MockExtras): TenantLeadsMocks {
  const update = vi.fn().mockResolvedValue({})
  const create = vi.fn().mockResolvedValue({})
  const queue = vi.fn().mockResolvedValue({})
  const find = vi.fn().mockImplementation(({ collection, page }: { collection: string; page?: number }) => {
    const pages: PageResult[] =
      collection === 'conversations'
        ? (extras?.conversationsPages ?? [{ docs: [], hasNextPage: false }])
        : collection === 'conversation-summaries'
          ? (extras?.summariesPages ?? [{ docs: [], hasNextPage: false }])
          : collection === 'tenants'
            ? (extras?.tenantsPages ?? [{ docs: [], hasNextPage: false }])
            : [{ docs: [], hasNextPage: false }]
    if (collection === 'leads') {
      return Promise.resolve({ docs: [lead], hasNextPage: false })
    }
    const result = pages[(page ?? 1) - 1] ?? { docs: [], hasNextPage: false }
    return Promise.resolve(result)
  })
  const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
  const payload = {
    find,
    update,
    create,
    count,
    jobs: { queue },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Payload
  return { payload, find, update, create, queue }
}

const promoteLead = {
  id: 7,
  fullName: 'Ana Pérez',
  status: 'nuevo',
  createdAt: daysAgoIso(1),
  numeroDeLlamadas: 0,
  pudoHablarDecisor: false,
  visitadoPresencialmente: false,
  nivelInteres: 'frio',
  prioridad: 'baja',
  assignedTo: 3,
}

describe('scoreTenantLeads — barrido tenant-scoped', () => {
  it('escribe el recálculo y dispara hot-lead al promover a caliente', async () => {
    const mocks = buildMockPayload(promoteLead, {
      conversationsPages: [
        { docs: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }], hasNextPage: false },
      ],
      summariesPages: [{ docs: [{ lead: 7, sentiment: 'positivo' }], hasNextPage: false }],
    })

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1, now: NOW })

    // 30 (inbound) + 25 (positivo) + 5 (nuevo) = 60 → caliente/media
    expect(res).toEqual({ scored: 1, updated: 1, promoted: 1 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        id: 7,
        data: { nivelInteres: 'caliente', prioridad: 'media' },
      }),
    )
    // Automatización hot-lead: brief IA encolado + tarea recordatorio asignada al agente
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'generate-lead-brief', input: { leadId: 7, tenantId: 1 } }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tasks',
        data: expect.objectContaining({ source: 'lead_hot', assignedTo: 3, priority: 'alta' }),
      }),
    )
  })

  it('no escribe ni dispara automatización cuando el scoring no cambia', async () => {
    const lead = {
      ...promoteLead,
      id: 8,
      fullName: 'Beto Ruiz',
      assignedTo: null,
    }
    const mocks = buildMockPayload(lead)

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1, now: NOW })

    expect(res).toEqual({ scored: 1, updated: 0, promoted: 0 })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
  })

  it('degrada un caliente sin actividad (recálculo bidireccional) sin disparar hot-lead', async () => {
    const lead = {
      id: 9,
      fullName: 'Carla Díaz',
      status: 'contactado',
      createdAt: daysAgoIso(10),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'caliente',
      prioridad: 'alta',
      assignedTo: 4,
    }
    const mocks = buildMockPayload(lead)

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1, now: NOW })

    // 10 (contactado) − 10·⌊(10−3)/2⌋ = 10 − 30 → piso 0
    expect(res).toEqual({ scored: 1, updated: 1, promoted: 0 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        id: 9,
        data: { nivelInteres: 'frio', prioridad: 'baja' },
      }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
  })

  it('lee señales de páginas posteriores (tenant con >1 page de conversaciones/summaries)', async () => {
    const mocks = buildMockPayload(promoteLead, {
      conversationsPages: [
        { docs: [], hasNextPage: true },
        { docs: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }], hasNextPage: false },
      ],
      summariesPages: [
        { docs: [{ lead: 99, sentiment: 'negativo' }], hasNextPage: true },
        { docs: [{ lead: 7, sentiment: 'positivo' }], hasNextPage: false },
      ],
    })

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1, now: NOW })

    // El inbound y el sentimiento del lead 7 viven en la página 2 — si no se
    // paginara, el lead se evaluaría frio por señales incompletas.
    expect(res).toEqual({ scored: 1, updated: 1, promoted: 1 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        id: 7,
        data: { nivelInteres: 'caliente', prioridad: 'media' },
      }),
    )
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'conversations', page: 2 }))
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'conversation-summaries', page: 2 }),
    )
  })

  it('repara automatización incompleta de un lead ya caliente (self-heal idempotente)', async () => {
    const lead = {
      id: 10,
      fullName: 'Daniela Ruiz',
      status: 'contactado',
      createdAt: daysAgoIso(10),
      numeroDeLlamadas: 0,
      pudoHablarDecisor: false,
      visitadoPresencialmente: false,
      nivelInteres: 'caliente',
      prioridad: 'media',
      assignedTo: 5,
    }
    const mocks = buildMockPayload(lead, {
      conversationsPages: [
        { docs: [{ lead: 10, lastInboundAt: daysAgoIso(0.2), lastMessageAt: daysAgoIso(0.2) }], hasNextPage: false },
      ],
      summariesPages: [{ docs: [{ lead: 10, sentiment: 'positivo' }], hasNextPage: false }],
    })

    const res = await scoreTenantLeads({ payload: mocks.payload, tenantId: 1, now: NOW })

    // 30 (inbound) + 25 (positivo) + 10 (contactado) = 65 → sigue caliente/media
    expect(res).toEqual({ scored: 1, updated: 0, promoted: 0 })
    expect(mocks.update).not.toHaveBeenCalled()
    // Pero la automatización corre igual: si una pasada anterior falló a mitad
    // (brief o tarea faltantes), el barrido diario la repara sin duplicar.
    expect(mocks.queue).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'generate-lead-brief', input: { leadId: 10, tenantId: 1 } }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tasks',
        data: expect.objectContaining({ source: 'lead_hot', assignedTo: 5 }),
      }),
    )
  })
})

describe('recalculate-lead-scores — handler del job', () => {
  it('itera tenants y agrega totales en el output', async () => {
    const mocks = buildMockPayload(promoteLead, {
      tenantsPages: [{ docs: [{ id: 1, name: 'Tenant Alpha' }], hasNextPage: false }],
      conversationsPages: [
        { docs: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }], hasNextPage: false },
      ],
      summariesPages: [{ docs: [{ lead: 7, sentiment: 'positivo' }], hasNextPage: false }],
    })

    if (typeof recalculateLeadScoresTask.handler !== 'function') {
      throw new Error('recalculateLeadScoresTask.handler must be a function')
    }
    type TaskArgs = Parameters<
      Extract<typeof recalculateLeadScoresTask.handler, (...args: never[]) => unknown>
    >[0]
    // El handler llama a scoreTenantLeads con Date.now(): se congela el reloj
    // del sistema para que el NOW de los fixtures siga siendo válido cualquier
    // día que corra la suite (sin esto, los tests rompen al pasar 24h).
    vi.useFakeTimers({ now: NOW })
    try {
      const result = (await recalculateLeadScoresTask.handler({
        req: { payload: mocks.payload },
      } as unknown as TaskArgs)) as {
        output: { scored: number; updated: number; promoted: number; summary: string }
      }

      expect(result.output).toMatchObject({ scored: 1, updated: 1, promoted: 1 })
      expect(result.output.summary).toContain('Evaluados: 1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('procesa tenants de páginas posteriores (hasNextPage true)', async () => {
    const mocks = buildMockPayload(promoteLead, {
      tenantsPages: [
        { docs: [{ id: 1, name: 'Tenant Alpha' }], hasNextPage: true },
        { docs: [{ id: 2, name: 'Tenant Beta' }], hasNextPage: false },
      ],
      conversationsPages: [
        { docs: [{ lead: 7, lastInboundAt: daysAgoIso(0.5), lastMessageAt: daysAgoIso(0.5) }], hasNextPage: false },
      ],
      summariesPages: [{ docs: [{ lead: 7, sentiment: 'positivo' }], hasNextPage: false }],
    })

    if (typeof recalculateLeadScoresTask.handler !== 'function') {
      throw new Error('recalculateLeadScoresTask.handler must be a function')
    }
    type TaskArgs = Parameters<
      Extract<typeof recalculateLeadScoresTask.handler, (...args: never[]) => unknown>
    >[0]
    vi.useFakeTimers({ now: NOW })
    try {
      const result = (await recalculateLeadScoresTask.handler({
        req: { payload: mocks.payload },
      } as unknown as TaskArgs)) as {
        output: { scored: number; updated: number; promoted: number }
      }

      // El lead se evalúa una vez por tenant — 2 tenants = 2 promociones.
      expect(result.output).toMatchObject({ scored: 2, updated: 2, promoted: 2 })
      expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'tenants', page: 2 }))
      expect(mocks.queue).toHaveBeenCalledWith(
        expect.objectContaining({ task: 'generate-lead-brief', input: { leadId: 7, tenantId: 2 } }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
