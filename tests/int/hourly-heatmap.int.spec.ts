import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { HourlyHeatmap } from '@/components/workspace/HourlyHeatmap'
import { getWorkspaceOverviewData } from '@/lib/overview-data'
import type { HourBucket } from '@/components/workspace/overview/types'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

afterEach(cleanup)

const mockUser = {
  id: 1,
  collection: 'users',
  email: 'admin@martes.local',
  roles: ['admin'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as User

describe('HourlyHeatmap — matriz 7×24 (ítem 6 del sector UI)', () => {
  const buckets: HourBucket[] = Array.from({ length: 168 }, (_, i) => ({
    dow: Math.floor(i / 24),
    hour: i % 24,
    count: 0,
  }))
  // Lunes 8:00 con el pico; domingo 20:00 medio; resto vacío
  buckets[0 * 24 + 8].count = 12
  buckets[6 * 24 + 20].count = 4

  it('renderiza las 168 celdas con etiqueta de día y aria-label por celda', () => {
    render(createElement(HourlyHeatmap, { hourBuckets: buckets, totalInteractions: 16 }))
    const cells = document.querySelectorAll('.heat-cell[role="img"]')
    // 168 celdas + 6 de la leyenda (heat-cell sin role) → solo las del grid llevan role
    expect(cells.length).toBe(168)
    expect(screen.getByText('Lun')).toBeDefined()
    expect(screen.getByText('Dom')).toBeDefined()

    const peak = screen.getByLabelText('12 interacciones los Lun a las 08:00')
    expect(peak).toBeDefined()
    expect(peak.className).toContain('heat-4') // 12/12 = nivel máximo
  })

  it('muestra el detalle al enfocar una celda (misma línea de detalle que el hover)', () => {
    render(createElement(HourlyHeatmap, { hourBuckets: buckets, totalInteractions: 16 }))
    const cell = screen.getByLabelText('4 interacciones los Dom a las 20:00')
    fireEvent.focus(cell)
    // La línea de detalle refleja la celda enfocada
    const detail = screen.getAllByText((_, el) => Boolean(el?.textContent?.includes('interacciones · Dom 20:00')))
    expect(detail.length).toBeGreaterThan(0)
    fireEvent.blur(cell)
    expect(screen.getByText(/Pasa el cursor sobre una celda/)).toBeDefined()
  })

  it('nivel 0 en celdas sin actividad — nunca se inventan cifras', () => {
    render(createElement(HourlyHeatmap, { hourBuckets: buckets, totalInteractions: 16 }))
    const empty = screen.getByLabelText('0 interacciones los Mar a las 03:00')
    expect(empty.className).toContain('heat-0')
  })
})

describe('overview-data — derivación de hourBuckets en la zona horaria del tenant', () => {
  it('un evento en el borde UTC cae en el día y hora locales de Caracas', async () => {
    // Martes 01:30 UTC = Lunes 21:30 en America/Caracas (UTC-4)
    const tuesdayUtcEarly = '2026-09-08T01:30:00.000Z'

    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        // Un solo evento real: la actividad del borde UTC (dentro del año)
        if (opts.collection === 'activities') {
          return Promise.resolve({ docs: [{ createdAt: tuesdayUtcEarly }], totalDocs: 1 })
        }
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
    })()
    const mockCount = () => Promise.resolve({ totalDocs: 0 })
    const mockPayload = {
      find: mockFind,
      count: mockCount,
      db: { pool: { query: viFnPoolQuery() } },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    // Lunes (dow 0) a las 21h locales
    const monday21 = result.hourBuckets.find((b) => b.dow === 0 && b.hour === 21)
    expect(monday21?.count).toBe(1)
    // Y NO cayó en martes 1h (que sería la lectura UTC)
    const tuesday1 = result.hourBuckets.find((b) => b.dow === 1 && b.hour === 1)
    expect(tuesday1?.count).toBe(0)
  })
})

/** Pool SQL mock que devuelve series vacías para los agregados del resumen. */
function viFnPoolQuery() {
  const emptyRows = { rows: [] }
  return (() => emptyRows) as unknown as () => Promise<{ rows: Array<Record<string, unknown>> }>
}
