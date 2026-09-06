import { describe, it, expect } from 'vitest'
import { parseCrmFilters } from '@/lib/crm-filters'
import { computeDealVelocity, computeWindowState, relativeLabel } from '@/lib/crm-pipeline-window'

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
})
