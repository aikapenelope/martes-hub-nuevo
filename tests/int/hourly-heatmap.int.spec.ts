import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { HourlyHeatmap } from '@/components/workspace/HourlyHeatmap'
import { getWorkspaceOverviewData, buildEmptyDayBuckets, zonedTimeToUtc } from '@/lib/overview-data'
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
    // Martes 01:30 UTC = Lunes 21:30 en America/Caracas (UTC-4).
    // La agregación la hace Postgres (AT TIME ZONE $tz + GROUP BY): el mock del
    // pool devuelve la fila YA agrupada como la produciría el SQL real.
    const poolQuery = (() => ({
      rows: [
        { day: '2026-09-07', dow: 0, hour: 21, n: 1 }, // lunes 21:30 local
      ],
    })) as unknown as () => Promise<{ rows: Array<Record<string, unknown>> }>

    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
    })()
    const mockPayload = {
      find: mockFind,
      count: () => Promise.resolve({ totalDocs: 0 }),
      db: { pool: { query: poolQuery } },
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

  it('una fila agrupada del SQL suma sus N eventos (no uno por fila)', async () => {
    // Postgres devuelve conteos por grupo: 7 eventos del mismo (día, dow, hora)
    const poolQuery = (() => ({
      rows: [{ day: '2026-09-07', dow: 0, hour: 9, n: 7 }],
    })) as unknown as () => Promise<{ rows: Array<Record<string, unknown>> }>

    const mockPayload = {
      find: (() => {
        let settingsCalled = false
        return (opts: { collection: string }) => {
          if (opts.collection === 'company-settings' && !settingsCalled) {
            settingsCalled = true
            return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
          }
          return Promise.resolve({ docs: [], totalDocs: 0 })
        }
      })(),
      count: () => Promise.resolve({ totalDocs: 0 }),
      db: { pool: { query: poolQuery } },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    expect(result.hourBuckets.find((b) => b.dow === 0 && b.hour === 9)?.count).toBe(7)
    expect(result.dayBuckets.find((b) => b.dateStr === '2026-09-07')?.count).toBe(7)
    expect(result.totalYearInteractions).toBe(7)
  })

  it('activities se agrupa por occurredAt (fallback): la actividad tardía cae en su día real', async () => {
    // Actividad creada el martes pero ocurrida el lunes 09:00 local
    const occurredMonday = '2026-09-07T13:00:00.000Z' // lunes 09:00 Caracas
    const createdTuesday = '2026-09-08T13:00:00.000Z' // martes 09:00 Caracas

    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string; select?: Record<string, unknown> }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        if (opts.collection === 'activities') {
          return Promise.resolve({
            docs: [{ occurredAt: occurredMonday, createdAt: createdTuesday }],
            totalDocs: 1,
            hasNextPage: false,
          })
        }
        return Promise.resolve({ docs: [], totalDocs: 0, hasNextPage: false })
      }
    })()
    const mockPayload = {
      find: mockFind,
      count: () => Promise.resolve({ totalDocs: 0 }),
      db: { pool: undefined }, // fuerza el fallback paginado
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    // Lunes 09:00 local (por occurredAt), NO martes
    const monday9 = result.hourBuckets.find((b) => b.dow === 0 && b.hour === 9)
    expect(monday9?.count).toBe(1)
    const tuesday9 = result.hourBuckets.find((b) => b.dow === 1 && b.hour === 9)
    expect(tuesday9?.count).toBe(0)
  })

  it('agrupa los pagos por paidAt (no createdAt) y pagina el fallback sin cap', async () => {
    // Pago creado hace 2 años pero PAGADO hace 2 horas — califica por paidAt
    // (dentro del año y dentro del día local de hoy) y cae por hora local
    const paidTwoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
    const createdLongAgo = '2024-01-10T10:00:00.000Z'
    // 500 actividades en página 1 + hasNextPage, 100 en página 2 (600 en total)
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      occurredAt: new Date(Date.now() - i * 3600_000).toISOString(),
    }))
    const page2 = Array.from({ length: 100 }, (_, i) => ({
      occurredAt: new Date(Date.now() - (500 + i) * 3600_000).toISOString(),
    }))

    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string; page?: number }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        if (opts.collection === 'activities') {
          return opts.page === 1
            ? Promise.resolve({ docs: page1, totalDocs: 600, hasNextPage: true })
            : Promise.resolve({ docs: page2, totalDocs: 600, hasNextPage: false })
        }
        if (opts.collection === 'messages') {
          return Promise.resolve({ docs: [], totalDocs: 0, hasNextPage: false })
        }
        if (opts.collection === 'payments') {
          // El registro trae paidAt (el instante que califica) y createdAt viejo
          return Promise.resolve({
            docs: [{ paidAt: paidTwoHoursAgo, createdAt: createdLongAgo }],
            totalDocs: 1,
            hasNextPage: false,
          })
        }
        return Promise.resolve({ docs: [], totalDocs: 0, hasNextPage: false })
      }
    })()
    const mockCount = () => Promise.resolve({ totalDocs: 0 })
    const mockPayload = {
      find: mockFind,
      count: mockCount,
      db: { pool: undefined }, // fuerza el fallback paginado
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    // Las 600 actividades (2 páginas) + 1 pago — sin cap de página única
    expect(result.totalYearInteractions).toBe(601)
    // El pago cae en SU día de pago (hoy local), no en su día de creación (hace 2 años)
    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(paidTwoHoursAgo))
    expect(result.dayBuckets.find((b) => b.dateStr === todayLocal)?.count).toBeGreaterThanOrEqual(1)
    // Y su hora local (paidAt − 4h de Caracas)
    const paidHourLocal = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour12: false, hour: '2-digit' })
        .formatToParts(new Date(paidTwoHoursAgo))
        .find((p) => p.type === 'hour')?.value ?? '0',
    ) % 24
    const paidDowLocal = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', weekday: 'short' }).format(
        new Date(paidTwoHoursAgo),
      ),
    )
    const bucket = result.hourBuckets.find((b) => b.dow === paidDowLocal && b.hour === paidHourLocal)
    expect(bucket?.count).toBeGreaterThanOrEqual(1)
  })

  it('buildEmptyDayBuckets no duplica ni salta fechas en zonas con DST cerca de medianoche', () => {
    // America/New_York: spring-forward 2026-03-08 02:00 EST→EDT y fall-back
    // 2026-11-01 02:00 EDT→EST. `now` en los instantes delicados: medianoche
    // local del día de transición (00:30 local).
    const delicateInstants = [
      new Date('2026-03-08T04:30:00.000Z'), // 2026-03-07 23:30 EST → hoy local = 03-07 (víspera)
      new Date('2026-03-09T04:30:00.000Z'), // 2026-03-09 00:30 EDT → hoy local = 03-09 (día después)
      new Date('2026-11-01T04:30:00.000Z'), // 2026-11-01 00:30 EDT → hoy local = 11-01 (transición)
      new Date('2026-11-02T05:30:00.000Z'), // 2026-11-02 00:30 EST → hoy local = 11-02 (día después)
    ]
    for (const now of delicateInstants) {
      const buckets = buildEmptyDayBuckets('America/New_York', now)
      const dates = buckets.map((b) => b.dateStr)
      // 364 fechas únicas, cronológicas (más antigua → hoy), presentes y consecutivas
      expect(new Set(dates).size).toBe(364)
      expect(dates[dates.length - 1]).toBe(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
      )
      for (let i = 1; i < dates.length; i++) {
        const older = new Date(`${dates[i - 1]}T00:00:00Z`).getTime()
        const newer = new Date(`${dates[i]}T00:00:00Z`).getTime()
        expect(newer - older).toBe(24 * 3600_000)
      }
    }
  })

  it('la frontera SQL coincide con la medianoche local del día más antiguo del grid', async () => {
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] })
    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
    })()
    const mockPayload = {
      find: mockFind,
      count: () => Promise.resolve({ totalDocs: 0 }),
      db: { pool: { query: poolQuery } },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    // El parámetro de frontera del SQL de interacciones = medianoche local
    // (Caracas) del día más antiguo de dayBuckets → query y grid cubren
    // EXACTAMENTE los mismos días calendario
    const oldestDay = result.dayBuckets[0].dateStr
    const expectedBoundary = zonedTimeToUtc(`${oldestDay}T00:00:00`, 'America/Caracas').toISOString()
    const interactionCall = poolQuery.mock.calls.find((call) =>
      String(call[0]).includes('UNION ALL'),
    )
    expect(interactionCall).toBeDefined()
    const sqlParams = interactionCall![1] as unknown[]
    expect(sqlParams[0]).toBe(10)
    expect(sqlParams[1]).toBe('America/Caracas')
    expect(sqlParams[2]).toBe(expectedBoundary)
  })

  it('messages legacy sin sentAt caen por createdAt y no se pierden (fallback)', async () => {
    const mondayLocal = '2026-09-07T13:00:00.000Z' // lunes 09:00 Caracas
    const mockFind = (() => {
      let settingsCalled = false
      return (opts: { collection: string; select?: Record<string, unknown> }) => {
        if (opts.collection === 'company-settings' && !settingsCalled) {
          settingsCalled = true
          return Promise.resolve({ docs: [{ timezone: 'America/Caracas' }] })
        }
        if (opts.collection === 'messages') {
          // Row legacy: sentAt null → el pickTs cae a createdAt
          return Promise.resolve({
            docs: [{ sentAt: null, createdAt: mondayLocal }],
            totalDocs: 1,
            hasNextPage: false,
          })
        }
        return Promise.resolve({ docs: [], totalDocs: 0, hasNextPage: false })
      }
    })()
    const mockPayload = {
      find: mockFind,
      count: () => Promise.resolve({ totalDocs: 0 }),
      db: { pool: undefined },
    } as unknown as Payload

    const result = await getWorkspaceOverviewData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 10,
    })

    const monday9 = result.hourBuckets.find((b) => b.dow === 0 && b.hour === 9)
    expect(monday9?.count).toBe(1)
  })
})

/** Pool SQL mock que devuelve series vacías para los agregados del resumen. */
function viFnPoolQuery() {
  const emptyRows = { rows: [] }
  return (() => emptyRows) as unknown as () => Promise<{ rows: Array<Record<string, unknown>> }>
}
