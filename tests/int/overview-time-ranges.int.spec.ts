import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TENANT_TIMEZONE,
  resolveTimeRangeWindow,
  zonedTimeToUtc,
} from '@/lib/overview-data'

const DAY_MS = 24 * 3600_000
const HOUR_MS = 3600_000

describe('resolveTimeRangeWindow — ventanas rodantes', () => {
  it('30d produce dos ventanas contiguas de 30 días cerca del fin de mes', () => {
    const now = new Date('2026-03-01T00:30:00Z')
    const w = resolveTimeRangeWindow('30d', { now })

    expect(w.periodEndIso).toBe(now.toISOString())
    expect(new Date(w.periodEndIso).getTime() - new Date(w.periodStartIso).getTime()).toBe(30 * DAY_MS)
    expect(w.previousEndIso).toBe(w.periodStartIso)
    expect(new Date(w.periodStartIso).getTime() - new Date(w.previousStartIso).getTime()).toBe(
      30 * DAY_MS,
    )
  })

  it('30d produce dos ventanas contiguas de 30 días cerca del inicio de mes', () => {
    const now = new Date('2026-04-02T15:00:00Z')
    const w = resolveTimeRangeWindow('30d', { now })

    expect(w.previousEndIso).toBe(w.periodStartIso)
    expect(new Date(w.periodEndIso).getTime() - new Date(w.periodStartIso).getTime()).toBe(30 * DAY_MS)
    expect(new Date(w.periodStartIso).getTime() - new Date(w.previousStartIso).getTime()).toBe(
      30 * DAY_MS,
    )
  })

  it('7d, 90d y ano mantienen períodos previos contiguos de igual duración', () => {
    const now = new Date('2026-09-03T12:00:00Z')
    for (const [range, days] of [
      ['7d', 7],
      ['90d', 90],
      ['ano', 365],
    ] as const) {
      const w = resolveTimeRangeWindow(range, { now })
      expect(new Date(w.periodEndIso).getTime() - new Date(w.periodStartIso).getTime()).toBe(
        days * DAY_MS,
      )
      expect(w.previousEndIso).toBe(w.periodStartIso)
      expect(new Date(w.periodStartIso).getTime() - new Date(w.previousStartIso).getTime()).toBe(
        days * DAY_MS,
      )
    }
  })
})

describe('resolveTimeRangeWindow — hoy con zona horaria del tenant', () => {
  it('respetar la timezone del tenant aunque el servidor esté en otro día (noche)', () => {
    // 2026-09-03T02:00Z = 2026-09-02 22:00 en America/Caracas (UTC-4, sin DST)
    const now = new Date('2026-09-03T02:00:00Z')
    const w = resolveTimeRangeWindow('hoy', { now })

    // El "hoy" del tenant empezó el 2 de septiembre a medianoche local (04:00Z)
    expect(w.periodStartIso).toBe('2026-09-02T04:00:00.000Z')
    expect(w.periodEndIso).toBe(now.toISOString())
    expect(w.previousEndIso).toBe(w.periodStartIso)
  })

  it('el período previo cubre el mismo lapso transcurrido del día, no el día completo', () => {
    // 22:00 locales → transcurrieron 22h del día; la ventana previa debe durar 22h
    const now = new Date('2026-09-03T02:00:00Z')
    const w = resolveTimeRangeWindow('hoy', { now })
    const elapsed = now.getTime() - new Date(w.periodStartIso).getTime()

    expect(elapsed).toBe(22 * HOUR_MS)
    expect(new Date(w.previousEndIso).getTime() - new Date(w.previousStartIso).getTime()).toBe(
      elapsed,
    )
    expect(w.previousStartIso).toBe('2026-09-01T06:00:00.000Z')
  })

  it('por la mañana temprano la comparación es contra el mismo tramo de ayer', () => {
    // 2026-09-03T09:00Z = 05:00 en Caracas → transcurridas 5h del día local
    const now = new Date('2026-09-03T09:00:00Z')
    const w = resolveTimeRangeWindow('hoy', { now })

    expect(w.periodStartIso).toBe('2026-09-03T04:00:00.000Z')
    // 5h antes de la medianoche local = ayer 19:00 locales = 2026-09-02T23:00Z
    expect(w.previousStartIso).toBe('2026-09-02T23:00:00.000Z')
    expect(
      new Date(w.previousEndIso).getTime() - new Date(w.previousStartIso).getTime(),
    ).toBe(5 * HOUR_MS)
  })

  it('calcula el día local correctamente en zonas al oeste de UTC (Asia/Tokyo)', () => {
    // 2026-09-02T16:00Z = 2026-09-03 01:00 en Asia/Tokyo (UTC+9)
    const now = new Date('2026-09-02T16:00:00Z')
    const w = resolveTimeRangeWindow('hoy', { now, timeZone: 'Asia/Tokyo' })

    expect(w.periodStartIso).toBe('2026-09-02T15:00:00.000Z')
    expect(
      new Date(w.previousEndIso).getTime() - new Date(w.previousStartIso).getTime(),
    ).toBe(HOUR_MS)
  })

  it('cae a America/Caracas con una timezone inválida o desconocida', () => {
    const now = new Date('2026-09-03T02:00:00Z')
    const w = resolveTimeRangeWindow('hoy', { now, timeZone: 'Marte/Olympus' })
    const expected = resolveTimeRangeWindow('hoy', { now, timeZone: DEFAULT_TENANT_TIMEZONE })

    expect(w).toEqual(expected)
  })
})

describe('zonedTimeToUtc', () => {
  it('convierte medianoche local de Caracas al instante UTC correcto', () => {
    expect(zonedTimeToUtc('2026-09-02T00:00:00', 'America/Caracas').toISOString()).toBe(
      '2026-09-02T04:00:00.000Z',
    )
  })

  it('maneja el borde de DST de primavera (America/New_York, marzo 2026)', () => {
    // 2026-03-08 es el salto horario en EE.UU.: a medianoche local aún aplica EST (UTC-5)
    expect(zonedTimeToUtc('2026-03-08T00:00:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    )
  })

  it('hace roundtrip: medianoche local formateada de vuelta es el mismo día', () => {
    const instant = zonedTimeToUtc('2026-09-02T00:00:00', 'America/Caracas')
    const back = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant)
    expect(back).toBe('2026-09-02')
  })
})
