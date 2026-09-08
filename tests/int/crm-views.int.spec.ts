import { describe, expect, it } from 'vitest'

import { crmViewHref, crmViewMatches, type SavedCrmViewLike } from '@/lib/crm-views'
import { parseCrmFilters, type CrmSearchParams } from '@/lib/crm-filters'

const view = (overrides: Partial<SavedCrmViewLike> = {}): SavedCrmViewLike => ({
  id: 1,
  name: 'Leads calificados míos',
  vista: 'leads',
  modo: 'pipeline',
  q: '',
  estado: 'calificado',
  fuente: '',
  agente: 'me',
  ...overrides,
})

const filtersFrom = (params: CrmSearchParams) => parseCrmFilters(params)

describe('crmViewHref — normalización de vistas guardadas', () => {
  it('construye la URL canónica con whitelists de la URL', () => {
    const href = crmViewHref(view({ modo: 'tabla' }))
    expect(href).toBe('/workspace/crm?vista=leads&modo=tabla&estado=calificado&agente=me')
  })

  it('una vista inválida se normaliza como lo haría la URL (fallback a defaults)', () => {
    const href = crmViewHref(view({ vista: 'hackers', estado: 'borrado', modo: '3d' }))
    expect(href).toBe('/workspace/crm?vista=leads&agente=me')
  })

  it('nunca incluye page: las vistas siempre arrancan en la página 1', () => {
    const href = crmViewHref(view({ q: 'ana' }))
    expect(href).not.toContain('page=')
  })

  it('fuente válida se preserva; agente todos se omite', () => {
    const href = crmViewHref(view({ estado: '', fuente: 'referido', agente: 'todos', modo: '' }))
    expect(href).toBe('/workspace/crm?vista=leads&fuente=referido')
  })
})

describe('crmViewMatches — resaltado de la vista activa', () => {
  it('coincide con los filtros actuales canónicos', () => {
    const filters = filtersFrom({ vista: 'leads', modo: 'tabla', estado: 'calificado', agente: 'me' })
    expect(crmViewMatches(view({ modo: 'tabla' }), filters)).toBe(true)
  })

  it('no coincide si cambia la búsqueda o el agente', () => {
    const base = filtersFrom({ vista: 'leads', estado: 'calificado', agente: 'me' })
    expect(crmViewMatches(view(), base)).toBe(true)
    expect(crmViewMatches(view({ q: 'otra cosa' }), base)).toBe(false)
    expect(crmViewMatches(view({ agente: 'todos' }), base)).toBe(false)
  })
})
