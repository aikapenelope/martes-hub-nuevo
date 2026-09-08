import { describe, expect, it, vi } from 'vitest'

import { aggregateConversionRows, getConversionReport, SOURCE_LABELS, type ConversionLeadRow } from '@/lib/conversion-reports'
import type { Payload } from 'payload'

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

describe('getConversionReport — regresiones de los hallazgos Devin #108', () => {
  const user = { id: 1, email: 'admin@martes.local', roles: ['admin'] } as never

  function mockPayloadFactory() {
    const queries: string[] = []
    const mockFind = vi.fn().mockImplementation((params: { collection: string }) => {
      if (params.collection === 'users') return Promise.resolve({ docs: [], totalDocs: 0 })
      return Promise.resolve({ docs: [], totalDocs: 0 })
    })
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      queries.push(sql)
      return Promise.resolve({ rows: [] })
    })
    const payload = {
      find: mockFind,
      db: { pool: { query: mockQuery } },
    } as unknown as Payload
    return { payload, mockFind, mockQuery, queries }
  }

  it('SEC-1: la resolución de nombres de agentes está scopeada al tenant y respeta access control', async () => {
    const { payload, mockFind } = mockPayloadFactory()

    await getConversionReport({ payload, user, tenantId: 10 })

    const usersCall = mockFind.mock.calls.find((call) => (call[0] as { collection: string }).collection === 'users')
    expect(usersCall).toBeDefined()
    const params = usersCall![0] as {
      where?: { and?: Array<Record<string, unknown>> }
      overrideAccess?: boolean
      user?: unknown
    }
    expect(params.overrideAccess).toBe(false)
    expect(params.user).toEqual(user)
    const tenantScope = params.where?.and?.find((clause) => 'or' in clause) as
      | { or?: Array<Record<string, unknown>> }
      | undefined
    expect(tenantScope?.or).toBeDefined()
    expect(JSON.stringify(tenantScope?.or)).toContain('tenants.tenant')
  })

  it('BUG-2: el GROUP BY por agente usa la columna real assigned_to_id (no assigned_to)', async () => {
    const { payload, mockQuery } = mockPayloadFactory()

    await getConversionReport({ payload, user, tenantId: 10 })

    // Dos queries por pool: por origen y por agente.
    expect(mockQuery).toHaveBeenCalledTimes(2)
    const sqls = mockQuery.mock.calls.map((call) => call[0] as string)
    const agentSql = sqls.find((sql) => sql.includes('assigned_to_id'))
    expect(agentSql).toBeDefined()
    expect(agentSql).toContain("COALESCE(assigned_to_id::text, 'sin_asignar')")
    // Ninguna query referencia la columna inexistente.
    expect(sqls.some((sql) => /assigned_to::text/.test(sql))).toBe(false)
  })
})
