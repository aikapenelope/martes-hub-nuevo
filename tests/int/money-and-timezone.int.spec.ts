import { describe, it, expect } from 'vitest'
import { wholeUsd, isWholeUsd } from '@/lib/money'
import { startOfMonthIso, startOfLastMonthIso } from '@/lib/db-aggregates'

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
