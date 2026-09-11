import { describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { getCrmBilledTotals } from '@/lib/crm-data'
import { parseCrmFilters } from '@/lib/crm-filters'
import {
  computeDealVelocity,
  computeWindowState,
  relativeLabel,
  resolveLastActiveTimestamp,
  resolvePastActivityTimestamp,
} from '@/lib/crm-pipeline-window'

describe('Pipeline de Ventas Conversacional 360°', () => {
  describe('parseCrmFilters — modo pipeline/tabla', () => {
    it('usa "pipeline" por defecto para la vista de leads', () => {
      expect(parseCrmFilters({ vista: 'leads' }).mode).toBe('pipeline')
    })

    it('respeta modo=tabla cuando se pide explícitamente', () => {
      expect(parseCrmFilters({ vista: 'leads', modo: 'tabla' }).mode).toBe('tabla')
    })

    it('ignora valores de modo fuera de la allowlist', () => {
      expect(parseCrmFilters({ vista: 'leads', modo: 'algo-invalido' }).mode).toBe('pipeline')
    })
  })

  describe('computeWindowState', () => {
    const NOW = new Date('2026-08-30T12:00:00.000Z').getTime()

    it('sin conversación (lastInboundAt null): sin ventana ni alerta', () => {
      const state = computeWindowState(null, null, NOW)
      expect(state).toEqual({ windowMinutesRemaining: null, needsReply: false, minutesSinceLastInbound: null })
    })

    it('ventana activa (mensaje entrante hace 1h, ya respondido)', () => {
      const oneHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString()
      const state = computeWindowState(oneHourAgo, new Date(NOW).toISOString(), NOW)
      expect(state.windowMinutesRemaining).toBeGreaterThan(120)
      expect(state.needsReply).toBe(false)
      expect(state.minutesSinceLastInbound).toBeNull()
    })

    it('ventana expirada (entrante hace 25h)', () => {
      const iso = new Date(NOW - 25 * 60 * 60 * 1000).toISOString()
      const state = computeWindowState(iso, iso, NOW)
      expect(state.windowMinutesRemaining).toBeLessThanOrEqual(0)
    })

    it('needsReply=true cuando el último evento de la conversación fue entrante', () => {
      const iso = new Date(NOW - 45 * 60 * 1000).toISOString()
      const state = computeWindowState(iso, iso, NOW)
      expect(state.needsReply).toBe(true)
      expect(state.minutesSinceLastInbound).toBe(45)
    })

    it('needsReply=false cuando hubo un mensaje saliente después del entrante', () => {
      const inbound = new Date(NOW - 45 * 60 * 1000).toISOString()
      const outboundAfter = new Date(NOW - 10 * 60 * 1000).toISOString()
      const state = computeWindowState(inbound, outboundAfter, NOW)
      expect(state.needsReply).toBe(false)
      expect(state.minutesSinceLastInbound).toBeNull()
    })
  })

  describe('relativeLabel', () => {
    const NOW = new Date('2026-08-30T12:00:00.000Z').getTime()

    it('sin timestamp devuelve "Sin mensajes"', () => {
      expect(relativeLabel(null, NOW)).toBe('Sin mensajes')
    })

    it('menos de 1 minuto: "justo ahora"', () => {
      expect(relativeLabel(new Date(NOW - 10_000).toISOString(), NOW)).toBe('justo ahora')
    })

    it('minutos: "hace N min"', () => {
      expect(relativeLabel(new Date(NOW - 10 * 60_000).toISOString(), NOW)).toBe('hace 10 min')
    })

    it('horas: "hace N h"', () => {
      expect(relativeLabel(new Date(NOW - 3 * 60 * 60_000).toISOString(), NOW)).toBe('hace 3 h')
    })

    it('días: "hace N d"', () => {
      expect(relativeLabel(new Date(NOW - 2 * 24 * 60 * 60_000).toISOString(), NOW)).toBe('hace 2 d')
    })
  })

  describe('computeDealVelocity', () => {
    const NOW = new Date('2026-08-30T12:00:00.000Z').getTime()

    it('sin actividad (null o undefined) devuelve cold con etiqueta adecuada', () => {
      expect(computeDealVelocity(null, NOW)).toEqual({
        temperature: 'cold',
        hoursSinceLastActivity: 999,
        label: 'Sin actividad',
      })
      expect(computeDealVelocity(undefined, NOW)).toEqual({
        temperature: 'cold',
        hoursSinceLastActivity: 999,
        label: 'Sin actividad',
      })
    })

    it('evento futuro (ej. vencimiento de tarea o cita posterior) no marca hot y devuelve cold', () => {
      const futureIso = new Date(NOW + 24 * 60 * 60 * 1000).toISOString()
      expect(computeDealVelocity(futureIso, NOW)).toEqual({
        temperature: 'cold',
        hoursSinceLastActivity: 999,
        label: 'Sin actividad',
      })
    })

    it('actividad hace menos de 1 hora devuelve hot con "Activo ahora"', () => {
      const iso = new Date(NOW - 30 * 60 * 1000).toISOString()
      expect(computeDealVelocity(iso, NOW)).toEqual({
        temperature: 'hot',
        hoursSinceLastActivity: 0,
        label: 'Activo ahora',
      })
    })

    it('actividad hace 5 horas devuelve hot con "Activo hace 5h"', () => {
      const iso = new Date(NOW - 5 * 60 * 60 * 1000).toISOString()
      expect(computeDealVelocity(iso, NOW)).toEqual({
        temperature: 'hot',
        hoursSinceLastActivity: 5,
        label: 'Activo hace 5h',
      })
    })

    it('actividad hace 23 horas devuelve hot', () => {
      const iso = new Date(NOW - 23 * 60 * 60 * 1000).toISOString()
      const res = computeDealVelocity(iso, NOW)
      expect(res.temperature).toBe('hot')
      expect(res.hoursSinceLastActivity).toBe(23)
    })

    it('actividad hace 36 horas (1.5 días) devuelve warm con "Inactivo hace 1d"', () => {
      const iso = new Date(NOW - 36 * 60 * 60 * 1000).toISOString()
      expect(computeDealVelocity(iso, NOW)).toEqual({
        temperature: 'warm',
        hoursSinceLastActivity: 36,
        label: 'Inactivo hace 1d',
      })
    })

    it('actividad hace 72 horas devuelve warm', () => {
      const iso = new Date(NOW - 72 * 60 * 60 * 1000).toISOString()
      const res = computeDealVelocity(iso, NOW)
      expect(res.temperature).toBe('warm')
      expect(res.hoursSinceLastActivity).toBe(72)
    })

    it('actividad hace 96 horas (>72h / 4 días) devuelve cold con "En riesgo (4d sin tocar)"', () => {
      const iso = new Date(NOW - 96 * 60 * 60 * 1000).toISOString()
      expect(computeDealVelocity(iso, NOW)).toEqual({
        temperature: 'cold',
        hoursSinceLastActivity: 96,
        label: 'En riesgo (4d sin tocar)',
      })
    })
  })

  describe('resolveLastActiveTimestamp & integración de actividades registradas', () => {
    const NOW = new Date('2026-08-30T12:00:00.000Z').getTime()
    const LEAD_CREATED_AT = new Date(NOW - 45 * 24 * 60 * 60 * 1000).toISOString() // 45 días atrás
    const OLD_MESSAGE_AT = new Date(NOW - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 días atrás
    const RECENT_ACTIVITY_AT = new Date(NOW - 2 * 60 * 60 * 1000).toISOString() // 2 horas atrás
    const WARM_ACTIVITY_AT = new Date(NOW - 36 * 60 * 60 * 1000).toISOString() // 36 horas atrás

    it('devuelve null si todas las marcas son null o undefined', () => {
      expect(resolveLastActiveTimestamp(null, undefined, null)).toBeNull()
    })

    it('prioriza la actividad registrada reciente sobre un lead y mensaje antiguos', () => {
      const resolved = resolveLastActiveTimestamp(OLD_MESSAGE_AT, RECENT_ACTIVITY_AT, LEAD_CREATED_AT)
      expect(resolved).toBe(RECENT_ACTIVITY_AT)

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('hot')
      expect(velocity.hoursSinceLastActivity).toBe(2)
      expect(velocity.label).toBe('Activo hace 2h')
    })

    it('lead antiguo con actividad registrada hace 36h calcula temperatura warm', () => {
      const resolved = resolveLastActiveTimestamp(null, WARM_ACTIVITY_AT, LEAD_CREATED_AT)
      expect(resolved).toBe(WARM_ACTIVITY_AT)

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('warm')
      expect(velocity.hoursSinceLastActivity).toBe(36)
      expect(velocity.label).toBe('Inactivo hace 1d')
    })

    it('lead antiguo sin mensajes ni actividades cae a su fecha de creación (cold)', () => {
      const resolved = resolveLastActiveTimestamp(null, null, LEAD_CREATED_AT)
      expect(resolved).toBe(LEAD_CREATED_AT)

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('cold')
      expect(velocity.hoursSinceLastActivity).toBe(45 * 24)
      expect(velocity.label).toBe('En riesgo (45d sin tocar)')
    })
  })

  describe('resolvePastActivityTimestamp — filtrado estricto de eventos pasados', () => {
    const NOW = new Date('2026-08-30T12:00:00.000Z').getTime()
    const FUTURE_DUE_DATE = new Date(NOW + 2 * 24 * 60 * 60 * 1000).toISOString() // +2 días
    const PAST_INTERACTION_AT = new Date(NOW - 5 * 60 * 60 * 1000).toISOString() // hace 5 horas
    const STALE_INTERACTION_AT = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString() // hace 10 días
    const FALLBACK_UPDATED_AT = new Date(NOW - 15 * 24 * 60 * 60 * 1000).toISOString() // hace 15 días

    it('ignora tareas/citas futuras y toma el primer evento pasado del timeline', () => {
      const timeline = [
        { date: FUTURE_DUE_DATE, kind: 'tarea' },
        { date: PAST_INTERACTION_AT, kind: 'actividad' },
        { date: STALE_INTERACTION_AT, kind: 'email' },
      ]
      const resolved = resolvePastActivityTimestamp(timeline, FALLBACK_UPDATED_AT, NOW)
      expect(resolved).toBe(PAST_INTERACTION_AT)

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('hot')
      expect(velocity.hoursSinceLastActivity).toBe(5)
    })

    it('si el timeline solo tiene eventos futuros, no los toma y usa el fallback pasado', () => {
      const timeline = [
        { date: FUTURE_DUE_DATE, kind: 'tarea' },
      ]
      const resolved = resolvePastActivityTimestamp(timeline, FALLBACK_UPDATED_AT, NOW)
      expect(resolved).toBe(FALLBACK_UPDATED_AT)

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('cold')
      expect(velocity.hoursSinceLastActivity).toBe(15 * 24)
    })

    it('si el fallback también fuera futuro o no existe, devuelve null (cold/sin actividad)', () => {
      const timeline = [{ date: FUTURE_DUE_DATE, kind: 'cita' }]
      const futureFallback = new Date(NOW + 60 * 60 * 1000).toISOString()
      const resolved = resolvePastActivityTimestamp(timeline, futureFallback, NOW)
      expect(resolved).toBeNull()

      const velocity = computeDealVelocity(resolved, NOW)
      expect(velocity.temperature).toBe('cold')
      expect(velocity.label).toBe('Sin actividad')
    })
  })

  describe('getCrmBilledTotals — Agregación exhaustiva de facturación CRM 360°', () => {
    const mockUser = {
      id: 42,
      email: 'agente@acme.com',
      roles: ['agente'] as ('admin' | 'agente' | 'viewer')[],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as User

    it('para cliente: suma exhaustivamente todos los pagos pagados y cuenta documentos', async () => {
      const mockPayments = [
        { id: 1, amount: 150 },
        { id: 2, amount: 350 },
        { id: 3, amount: 500 },
      ]

      const mockFind = vi.fn().mockResolvedValue({
        docs: mockPayments,
        hasNextPage: false,
      })

      const mockPayload = { find: mockFind } as unknown as Payload

      const res = await getCrmBilledTotals({
        payload: mockPayload,
        user: mockUser,
        tenantId: 5,
        type: 'clientes',
        id: 99,
      })

      expect(res).toEqual({
        totalBilled: 1000,
        billedCount: 3,
      })

      expect(mockFind).toHaveBeenCalledTimes(1)
      const callArgs = mockFind.mock.calls[0][0]
      expect(callArgs.collection).toBe('payments')
      expect(callArgs.overrideAccess).toBe(false)
      expect(callArgs.user).toBe(mockUser)
      expect(callArgs.where).toEqual({
        and: [
          { tenant: { equals: 5 } },
          { client: { in: [99] } },
          { status: { equals: 'pagado' } },
        ],
      })
    })

    it('para cliente: soporta paginación de múltiples páginas sin truncar en 500', async () => {
      const page1Docs = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, amount: 10 }))
      const page2Docs = Array.from({ length: 250 }, (_, i) => ({ id: 500 + i + 1, amount: 20 }))

      const mockFind = vi.fn().mockImplementation(({ page }: { page: number }) => {
        if (page === 1) {
          return Promise.resolve({ docs: page1Docs, hasNextPage: true })
        }
        return Promise.resolve({ docs: page2Docs, hasNextPage: false })
      })

      const mockPayload = { find: mockFind } as unknown as Payload

      const res = await getCrmBilledTotals({
        payload: mockPayload,
        user: mockUser,
        tenantId: 5,
        type: 'clientes',
        id: 101,
      })

      // 500 * 10 = 5000; 250 * 20 = 5000 => Total = 10000; Count = 750
      expect(res).toEqual({
        totalBilled: 10000,
        billedCount: 750,
      })
      expect(mockFind).toHaveBeenCalledTimes(2)
    })

    it('para empresa: suma pagos de todos sus clientes vinculados (relatedClients)', async () => {
      const mockPayments = [
        { id: 10, amount: 1200 },
        { id: 11, amount: 800 },
      ]

      const mockFind = vi.fn().mockResolvedValue({
        docs: mockPayments,
        hasNextPage: false,
      })

      const mockPayload = { find: mockFind } as unknown as Payload

      const res = await getCrmBilledTotals({
        payload: mockPayload,
        user: mockUser,
        tenantId: 7,
        type: 'empresas',
        id: 20,
        relatedClients: [{ id: 301 }, { id: 302 }, { id: 303 }],
      })

      expect(res).toEqual({
        totalBilled: 2000,
        billedCount: 2,
      })

      const callArgs = mockFind.mock.calls[0][0]
      expect(callArgs.where).toEqual({
        and: [
          { tenant: { equals: 7 } },
          { client: { in: [301, 302, 303] } },
          { status: { equals: 'pagado' } },
        ],
      })
    })

    it('para empresa sin clientes vinculados: devuelve 0 inmediatamente sin consultar DB', async () => {
      const mockFind = vi.fn()
      const mockPayload = { find: mockFind } as unknown as Payload

      const res = await getCrmBilledTotals({
        payload: mockPayload,
        user: mockUser,
        tenantId: 7,
        type: 'empresas',
        id: 25,
        relatedClients: [],
      })

      expect(res).toEqual({ totalBilled: 0, billedCount: 0 })
      expect(mockFind).not.toHaveBeenCalled()
    })

    it('para leads: devuelve 0 inmediatamente sin consultar DB', async () => {
      const mockFind = vi.fn()
      const mockPayload = { find: mockFind } as unknown as Payload

      const res = await getCrmBilledTotals({
        payload: mockPayload,
        user: mockUser,
        tenantId: 7,
        type: 'leads',
        id: 55,
      })

      expect(res).toEqual({ totalBilled: 0, billedCount: 0 })
      expect(mockFind).not.toHaveBeenCalled()
    })
  })
})
