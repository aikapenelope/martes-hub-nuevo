import { describe, expect, it } from 'vitest'

import { parseCrmFilters } from '@/lib/crm-filters'

describe('parseCrmFilters', () => {
  it('usa una configuración segura por defecto', () => {
    expect(parseCrmFilters({})).toEqual({
      view: 'leads',
      query: '',
      status: 'todos',
      stage: 'todos',
      page: 1,
    })
  })

  it('solo acepta estados válidos para la vista activa', () => {
    expect(parseCrmFilters({ vista: 'leads', estado: 'contactado' }).status).toBe('contactado')
    expect(parseCrmFilters({ vista: 'leads', estado: 'activo' }).status).toBe('todos')
    expect(parseCrmFilters({ vista: 'clientes', estado: 'activo' }).stage).toBe('activo')
    expect(parseCrmFilters({ vista: 'clientes', estado: 'contactado' }).stage).toBe('todos')
  })

  it('acota página y texto de búsqueda', () => {
    expect(parseCrmFilters({ page: '-30' }).page).toBe(1)
    expect(parseCrmFilters({ page: '99999' }).page).toBe(500)
    expect(parseCrmFilters({ q: `  ${'x'.repeat(200)}  ` }).query).toHaveLength(120)
  })

  it('toma el primer valor si Next entrega un array', () => {
    const filters = parseCrmFilters({ vista: ['clientes', 'leads'], page: ['3', '4'] })
    expect(filters.view).toBe('clientes')
    expect(filters.page).toBe(3)
  })
})
