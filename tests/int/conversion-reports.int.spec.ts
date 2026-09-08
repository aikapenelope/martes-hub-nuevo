import { describe, expect, it } from 'vitest'

import { aggregateConversionRows, SOURCE_LABELS, type ConversionLeadRow } from '@/lib/conversion-reports'

const lead = (overrides: Partial<ConversionLeadRow>): ConversionLeadRow => ({
  source: 'whatsapp',
  status: 'nuevo',
  converted: false,
  assignedTo: null,
  ...overrides,
})

describe('aggregateConversionRows — embudo entrada→contactado→calificado→cliente', () => {
  it('acumula etapas alcanzadas por ranking de estado y conversión', () => {
    const rows = aggregateConversionRows(
      [
        lead({ source: 'whatsapp', status: 'nuevo' }),
        lead({ source: 'whatsapp', status: 'contactado' }),
        lead({ source: 'whatsapp', status: 'calificado' }),
        lead({ source: 'whatsapp', status: 'nuevo', converted: true }),
      ],
      (l) => l.source ?? 'manual',
      (key) => SOURCE_LABELS[key] ?? key,
    )

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // 4 entradas; contactado alcanza 3 (contactado + calificado + convertido);
    // calificado alcanza 2 (calificado + convertido); cliente = 1 convertido.
    expect(row).toMatchObject({
      key: 'whatsapp',
      label: 'WhatsApp Directo',
      entrada: 4,
      contactado: 3,
      calificado: 2,
      cliente: 1,
      descartado: 0,
      conversionPct: 25,
    })
  })

  it('descarta leads sin teléfono y marca descartados solo como entrada', () => {
    const rows = aggregateConversionRows(
      [
        lead({ source: 'manual', status: 'descartado' }),
        lead({ source: 'manual', status: 'nuevo' }),
      ],
      (l) => l.source ?? 'manual',
      (key) => SOURCE_LABELS[key] ?? key,
    )

    expect(rows[0]).toMatchObject({ entrada: 2, contactado: 0, calificado: 0, cliente: 0, descartado: 1, conversionPct: 0 })
  })

  it('desglosa por agente incluyendo el bucket sin asignar', () => {
    const rows = aggregateConversionRows(
      [
        lead({ assignedTo: 3, status: 'contactado' }),
        lead({ assignedTo: 3, status: 'contactado' }),
        lead({ status: 'contactado' }),
      ],
      (l) => (l.assignedTo != null ? String(l.assignedTo) : 'sin_asignar'),
      (key) => (key === 'sin_asignar' ? 'Sin asignar' : `Agente #${key}`),
    )

    expect(rows.map((r) => [r.key, r.entrada])).toEqual([
      ['3', 2],
      ['sin_asignar', 1],
    ])
    expect(rows[0]).toMatchObject({ label: 'Agente #3', contactado: 2, conversionPct: 0 })
  })

  it('ordena por entradas descendente', () => {
    const rows = aggregateConversionRows(
      [
        lead({ source: 'manual' }),
        lead({ source: 'manual' }),
        lead({ source: 'referido' }),
      ],
      (l) => l.source ?? 'manual',
      (key) => SOURCE_LABELS[key] ?? key,
    )
    expect(rows.map((r) => r.key)).toEqual(['manual', 'referido'])
  })
})
