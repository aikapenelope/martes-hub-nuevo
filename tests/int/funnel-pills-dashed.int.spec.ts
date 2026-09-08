import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { MonoFunnel, type FunnelStage } from '@/components/workspace/monocharts'
import { CockpitSourceBreakdown } from '@/components/workspace/overview/CockpitSourceBreakdown'
import type { ChannelSourceMetric } from '@/components/workspace/overview/types'

/**
 * Tandas 3-4 del sector UI (patrón dashboard-9 adaptado a OLED):
 * píldoras de % en el embudo y barras punteadas en desgloses.
 */

afterEach(cleanup)

describe('MonoFunnel — píldora de tasa (tanda 3)', () => {
  const stages: FunnelStage[] = [
    { label: 'Nuevos', count: 100 },
    { label: 'Conversación', count: 53, conversionRate: 53 },
    { label: 'Calificados', count: 23, conversionRate: 43.4 },
    { label: 'Ganados', count: 8, conversionRate: 34.8 },
  ]

  it('renderiza la tasa dentro de píldora blanca por cada etapa con conversión', () => {
    render(createElement(MonoFunnel, { stages }))
    const pills = screen.getAllByText(/%$/)
    expect(pills.length).toBe(3) // la primera etapa no lleva tasa
    // Píldora blanca: texto negro sobre fondo blanco
    const first = pills[0]
    expect(first.className).toContain('bg-white')
    expect(first.className).toContain('text-black')
    expect(first.textContent).toBe('53%')
  })

  it('muestra píldora vacía (—) cuando la etapa no tiene base de comparación', () => {
    render(
      createElement(MonoFunnel, {
        stages: [
          { label: 'Nuevos', count: 10 },
          { label: 'Conversación', count: 4, conversionRate: null },
        ],
      }),
    )
    expect(screen.getByText('—')).toBeDefined()
  })

  it('la píldora vacía de la barra más ancha no sale del chart (clamp)', () => {
    // La etapa con conversiónRate null es aquí la más ancha (100%) — su píldora
    // debe quedar dentro del chart, no en left: 102%
    const { container } = render(
      createElement(MonoFunnel, {
        stages: [
          { label: 'Cotización', count: 3 },
          { label: 'Sin datos', count: 5, conversionRate: null },
          { label: 'Ganados', count: 1, conversionRate: 20 },
        ],
      }),
    )
    const emptyPill = screen.getByText('—')
    const style = emptyPill.getAttribute('style') ?? ''
    expect(style).toContain('left: 88%')
    // sanity: dentro del contenedor del chart
    expect(container.contains(emptyPill)).toBe(true)
  })

  it('conserva el conteo y el importe por etapa', () => {
    render(
      createElement(MonoFunnel, {
        stages: [
          { label: 'Cotización', count: 12, valueAmount: 4500 },
          { label: 'Ganados', count: 5, conversionRate: 41.7 },
        ],
      }),
    )
    expect(screen.getByText('12')).toBeDefined()
    expect(screen.getByText('$4.500')).toBeDefined()
  })
})

describe('CockpitSourceBreakdown — barra punteada (tanda 4)', () => {
  const sources: ChannelSourceMetric[] = [
    { source: 'google_maps', label: 'Google Maps / Local', count: 60, percentage: 60 },
    { source: 'whatsapp', label: 'WhatsApp Directo', count: 30, percentage: 30 },
    { source: 'referido', label: 'Referidos', count: 10, percentage: 10 },
  ]

  it('renderiza cada canal con conteo, porcentaje y barra punteada', () => {
    render(createElement(CockpitSourceBreakdown, { sources }))
    // El label aparece en la leyenda del donut y en la fila del canal
    expect(screen.getAllByText('Google Maps / Local').length).toBeGreaterThanOrEqual(2)
    // Porcentajes en leyenda del donut y en la fila del canal
    expect(screen.getAllByText('30%').length).toBeGreaterThanOrEqual(2)

    // Barra punteada: repeating-linear-gradient con tramos transparentes
    const bars = document.querySelectorAll('[role="img"][aria-label*="leads"]')
    expect(bars.length).toBe(3)
    const style = (bars[0] as HTMLElement).getAttribute('style') ?? ''
    expect(style).toContain('repeating-linear-gradient')
    expect(style).toContain('transparent')
  })

  it('estado vacío honesto cuando no hay canales', () => {
    render(createElement(CockpitSourceBreakdown, { sources: [] }))
    expect(screen.getByText(/Sin prospectos registrados/)).toBeDefined()
  })
})
