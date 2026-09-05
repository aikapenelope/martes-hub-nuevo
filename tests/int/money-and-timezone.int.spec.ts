import { describe, it, expect } from 'vitest'
import { wholeUsd, isWholeUsd } from '@/lib/money'
import { startOfMonthIso, startOfLastMonthIso, monthlyPendingSeries } from '@/lib/db-aggregates'

describe('wholeUsd — dinero entero (sin centavos)', () => {
  it('redondea cualquier entrada numérica al entero más cercano', () => {
    expect(wholeUsd(19.99)).toBe(20)
    expect(wholeUsd(19.4)).toBe(19)
    expect(wholeUsd('120')).toBe(120)
    expect(wholeUsd(0.30000000000000004)).toBe(0)
    expect(wholeUsd(-5.5)).toBe(-5)
  })

  it('devuelve null ante entradas no numéricas', () => {
    expect(wholeUsd('abc')).toBeNull()
    expect(wholeUsd(undefined)).toBeNull()
    expect(wholeUsd(null)).toBeNull()
    expect(wholeUsd(Number.NaN)).toBeNull()
    expect(wholeUsd(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('isWholeUsd solo acepta integers tipados como number', () => {
    expect(isWholeUsd(100)).toBe(true)
    expect(isWholeUsd(100.5)).toBe(false)
    expect(isWholeUsd('100')).toBe(false)
    expect(isWholeUsd(null)).toBe(false)
  })

  it('rechaza montos que exceden el rango exacto de float64 (2^53) en vez de corromperlos', () => {
    // 2^53 + 1 no es representable: persistirlo cambiaría el valor silenciosamente
    expect(wholeUsd(9007199254740993)).toBeNull()
    expect(wholeUsd('9007199254740993')).toBeNull()
    expect(wholeUsd(9007199254740991)).toBe(9007199254740991)
    expect(isWholeUsd(9007199254740993)).toBe(false)
    expect(isWholeUsd(2 ** 53)).toBe(false)
  })
})

describe('límites de mes en hora de Caracas', () => {
  it('startOfMonthIso apunta al día 1 del mes de Caracas con offset -04:00', () => {
    const iso = startOfMonthIso()
    expect(iso).toMatch(/^\d{4}-\d{2}-01T00:00:00-04:00$/)

    // El mes 'YYYY-MM' debe coincidir con el mes actual visto desde Caracas
    const caracasMonth = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date())
    expect(iso.slice(0, 7)).toBe(caracasMonth)
  })

  it('startOfLastMonthIso apunta al mes anterior', () => {
    const current = startOfMonthIso()
    const last = startOfLastMonthIso()
    const [y, m] = current.slice(0, 7).split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 - 1, 1))
    const expectedMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    expect(last.slice(0, 7)).toBe(expectedMonth)
  })
})

describe('monthlyPendingSeries — due_date como fecha calendario UTC', () => {
  type PoolQuery = (text: string, params?: unknown[]) => Promise<{ rows: Array<{ month: string; total: string | number }> }>

  function makePayload(query: PoolQuery) {
    return { db: { pool: { query } } } as unknown as import('payload').Payload
  }

  it('agrupa due_date SIN conversión de zona y usa medianoche UTC como límite inferior (incluye el día 1)', async () => {
    let capturedSql = ''
    let capturedParams: unknown[] = []
    const query: PoolQuery = (text, params) => {
      capturedSql = text
      capturedParams = params ?? []
      return Promise.resolve({ rows: [] })
    }

    await monthlyPendingSeries(makePayload(query), 10, 6)

    // Sin AT TIME ZONE sobre due_date: su fecha calendario ES el mes de negocio
    expect(capturedSql).not.toMatch(/due_date\s+AT\s+TIME\s+ZONE/i)
    expect(capturedSql).toMatch(/date_trunc\('month',\s*due_date\)/i)

    // Límite inferior: medianoche UTC del día 1 del mes más antiguo de la serie
    // (el offset -04:00 excluía los vencimientos del día 1)
    const boundary = String(capturedParams[2])
    expect(boundary).toMatch(/^\d{4}-\d{2}-01T00:00:00Z$/)
  })

  it('un vencimiento del día 1 del mes más antiguo cae dentro del límite y en su mes correcto', async () => {
    const rows: Array<{ month: string; total: string | number }> = []
    let capturedParams: unknown[] = []
    const query: PoolQuery = (text, params) => {
      capturedParams = params ?? []
      // Simula lo que haría Postgres con la semántica corregida: los due_date son
      // UTC medianoche de su fecha calendario; date_trunc('month', due_date) los
      // agrupa por el mes escrito en el formulario.
      const boundary = new Date(String(capturedParams[2]))
      const firstDayOfEarliestMonth = new Date(`${boundary.toISOString().slice(0, 7)}-01T00:00:00Z`)
      // due_date 'YYYY-MM-01' del mes más antiguo, escrito como UTC medianoche
      expect(firstDayOfEarliestMonth.getTime()).toBeGreaterThanOrEqual(boundary.getTime())
      const month = firstDayOfEarliestMonth.toISOString().slice(0, 7)
      rows.push({ month, total: 500 })
      return Promise.resolve({ rows })
    }

    const series = await monthlyPendingSeries(makePayload(query), 10, 6)

    // El punto del mes más antiguo de la serie recibe el total del día 1
    expect(series[0].total).toBe(500)
    expect(series.length).toBe(6)
  })
})
