import { describe, it, expect } from 'vitest'
import { buildLeadUpdateData } from '@/lib/lead-update-data'

describe('buildLeadUpdateData — semántica de relaciones (null vs undefined)', () => {
  it('null = limpiar la relación: atraviesa al data de payload.update', () => {
    const data = buildLeadUpdateData({
      fullName: 'Juan Pérez',
      segment: null,
      assignedTo: null,
      estimatedValue: null,
    })

    expect(data.segment).toBeNull()
    expect(data.assignedTo).toBeNull()
    expect(data.estimatedValue).toBeNull()
  })

  it('undefined = no actualizar: el campo se omite y no toca el valor guardado', () => {
    const data = buildLeadUpdateData({ fullName: 'Juan Pérez' })

    expect('segment' in data ? data.segment : undefined).toBeUndefined()
    expect('assignedTo' in data ? data.assignedTo : undefined).toBeUndefined()
    expect('estimatedValue' in data ? data.estimatedValue : undefined).toBeUndefined()
    expect(data.fullName).toBe('Juan Pérez')
  })

  it('distingue ambos casos en la misma llamada (campo tocado vs campo preservado)', () => {
    const data = buildLeadUpdateData({
      fullName: 'Juan Pérez',
      segment: null, // el usuario eligió "Sin rubro" → se limpia
      assignedTo: 9, // el usuario eligió otro agente → se actualiza
      // estimatedValue ausente → no se toca
    })

    expect(data.segment).toBeNull()
    expect(data.assignedTo).toBe(9)
    expect('estimatedValue' in data ? data.estimatedValue : undefined).toBeUndefined()
  })

  it('normaliza texto y el nombre es obligatorio tras recortar', () => {
    const data = buildLeadUpdateData({
      fullName: '  Ana Pérez  ',
      companyName: '  Acme  ',
      commercialNotes: '  notas  ',
    })
    expect(data.fullName).toBe('Ana Pérez')
    expect(data.companyName).toBe('Acme')
    expect(data.commercialNotes).toBe('notas')
  })

  it('recorta el nombre a 160 caracteres', () => {
    const data = buildLeadUpdateData({ fullName: 'x'.repeat(200) })
    expect((data.fullName as string).length).toBe(160)
  })

  it('acota los textos largos (server actions no crean registros gigantes)', () => {
    const data = buildLeadUpdateData({
      fullName: 'Ana Pérez',
      companyName: 'c'.repeat(5000),
      commercialNotes: 'n'.repeat(100000),
      notes: 'o'.repeat(100000),
      googleMapsUrl: 'https://maps.google.com/' + 'x'.repeat(5000),
      phone: '9'.repeat(1000),
    })

    expect((data.companyName as string).length).toBe(200)
    expect((data.commercialNotes as string).length).toBe(2000)
    expect((data.notes as string).length).toBe(2000)
    expect((data.googleMapsUrl as string).length).toBe(500)
    expect((data.phone as string).length).toBe(40)
  })

  it('campos de texto vacíos (solo espacios) se omiten del update', () => {
    const data = buildLeadUpdateData({ fullName: 'Ana', companyName: '   ' })
    expect('companyName' in data ? data.companyName : undefined).toBeUndefined()
  })
})
