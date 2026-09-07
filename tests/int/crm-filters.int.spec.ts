import { describe, expect, it } from 'vitest'

import { parseCrmFilters } from '@/lib/crm-filters'

describe('parseCrmFilters', () => {
  it('usa una configuración segura por defecto', () => {
    expect(parseCrmFilters({})).toEqual({
      view: 'leads',
      mode: 'pipeline',
      query: '',
      status: 'todos',
      stage: 'todos',
      agent: 'todos',
      source: undefined,
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

  it('acepta la vista de empresas y sanitiza el origen (fuente)', () => {
    const companyFilters = parseCrmFilters({ vista: 'empresas' })
    expect(companyFilters.view).toBe('empresas')

    const sourceFilters = parseCrmFilters({ vista: 'leads', fuente: 'google_maps' })
    expect(sourceFilters.source).toBe('google_maps')

    const invalidSourceFilters = parseCrmFilters({ vista: 'leads', fuente: 'canal_inexistente' })
    expect(invalidSourceFilters.source).toBeUndefined()
  })
})

import { buildCrmHref } from '@/components/workspace/crm/CrmViewNavigation'

describe('buildCrmHref', () => {
  it('construye la URL respetando vista y filtros activos', () => {
    const filters = parseCrmFilters({ vista: 'leads', agente: 'me', estado: 'contactado' })
    const href = buildCrmHref(filters, { agente: 'user_123' })
    expect(href).toContain('vista=leads')
    expect(href).toContain('agente=user_123')
    expect(href).toContain('estado=contactado')
  })

  it('elimina parámetros cuando se pasa todos o undefined', () => {
    const filters = parseCrmFilters({ vista: 'leads', agente: 'me' })
    const href = buildCrmHref(filters, { agente: 'todos' })
    expect(href).not.toContain('agente=')
  })
})
