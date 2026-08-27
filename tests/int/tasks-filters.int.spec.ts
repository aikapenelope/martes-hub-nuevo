import { describe, expect, it } from 'vitest'
import { checklistProgress, dueState, parseTaskFilters } from '@/lib/tasks-filters'

describe('task filters', () => {
  it('normalizes unknown values to safe defaults', () => {
    expect(parseTaskFilters({ vista: 'cards', estado: 'hack', prioridad: 'x', responsable: '-1', page: '0' })).toEqual({
      view: 'tablero', query: '', status: 'todos', priority: 'todas', assignee: 'todos', due: 'todos', page: 1,
    })
  })

  it('accepts valid scoped filters and trims search', () => {
    expect(parseTaskFilters({ vista: 'lista', q: '  cobro pendiente  ', estado: 'bloqueada', prioridad: 'urgente', responsable: '7', vencimiento: 'hoy', page: '3' })).toEqual({
      view: 'lista', query: 'cobro pendiente', status: 'bloqueada', priority: 'urgente', assignee: 7, due: 'hoy', page: 3,
    })
  })
})

describe('task presentation helpers', () => {
  it('calculates checklist completion', () => {
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3, percent: 67 })
  })

  it('classifies due dates by local calendar day', () => {
    const now = new Date('2026-08-27T12:00:00')
    expect(dueState('2026-08-26', now)).toBe('overdue')
    expect(dueState('2026-08-27', now)).toBe('today')
    expect(dueState('2026-08-30', now)).toBe('upcoming')
    expect(dueState(undefined, now)).toBe('none')
  })
})
