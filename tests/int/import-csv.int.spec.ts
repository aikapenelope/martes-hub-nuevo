import { describe, it, expect, vi } from 'vitest'
import {
  importCsvHandler,
  pick,
  parseDate,
  parseBool,
  cleanKey,
  normalizeSource,
  normalizeEnum,
} from '@/endpoints/importCsv'
import type { PayloadRequest } from 'payload'
import type { User } from '@/payload-types'

function createMockRequest({
  csvContent,
  collection = 'leads',
  tenantId = 10,
  existingDocs = [],
}: {
  csvContent: string
  collection?: 'clients' | 'leads'
  tenantId?: number
  existingDocs?: unknown[]
}) {
  const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => csvContent })
  const formData = new FormData()
  formData.set('file', file)

  const createdDocs: Array<{ collection: string; data: Record<string, unknown> }> = []
  const findQueries: Array<{ collection: string; where: unknown }> = []

  const mockUser = {
    id: 1,
    email: 'admin@martes.local',
    roles: ['admin'],
    tenants: [{ tenant: { id: tenantId, name: 'Tenant Test', slug: 'tenant-test' } }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as User

  const req = {
    url: `http://localhost/api/import-csv?collection=${collection}`,
    user: mockUser,
    formData: async () => formData,
    payload: {
      find: vi.fn(async ({ collection: col, where }) => {
        findQueries.push({ collection: col, where })
        return { docs: existingDocs }
      }),
      create: vi.fn(async ({ collection: col, data }: { collection: string; data: Record<string, unknown> }) => {
        const id = createdDocs.length + 1
        createdDocs.push({ collection: col, data })
        return { id, ...data }
      }),
    },
  } as unknown as PayloadRequest

  return { req, createdDocs, findQueries }
}

describe('importCsvHandler — deduplicación con aliases y canonicalización', () => {
  it('detecta duplicado cuando la fila usa correo en lugar de email', async () => {
    const csv = 'Nombre,correo\nEmpresa A,contacto@empresa.com'
    const { req, findQueries, createdDocs } = createMockRequest({
      csvContent: csv,
      existingDocs: [{ id: 99, email: 'contacto@empresa.com' }],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.createdCount).toBe(0)
    expect(json.issueCount).toBe(1)
    expect(json.issues[0].message).toContain('Duplicado')
    expect(createdDocs.length).toBe(true ? 0 : 1)

    expect(findQueries.length).toBe(1)
    expect(findQueries[0].where).toEqual({
      and: [{ email: {equals: 'contacto@empresa.com' } }, { tenant: { equals: 10 } }],
    })
  })

  it('detecta duplicado cuando la fila usa telefono en lugar de phone', async () => {
    const csv = 'Nombre,telefono\nEmpresa B,+584121234567'
    const { req, findQueries, createdDocs } = createMockRequest({
      csvContent: csv,
      existingDocs: [{ id: 88, phone: '+584121234567' }],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(json.createdCount).toBe(0)
    expect(json.issueCount).toBe(1)
    expect(json.issues[0].message).toContain('Duplicado')
    expect(createdDocs.length).toBe(0)

    expect(findQueries.length).toBe(1)
    expect(findQueries[0].where).toEqual({
      and: [{ phone: { equals: '+584121234567' } }, { tenant: {equals: 10 } }],
    })
  })

  it('detecta duplicado cuando la fila usa whatsapp como téléfono', async () => {
    const csv = 'Nombre,whatsapp\nEmpresa C,+584149876543'
    const { req, findQueries, createdDocs } = createMockRequest({
      csvContent: csv,
      existingDocs: [{ id: 77, phone: '+584149876543' }],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(json.createdCount).toBe(0)
    expect(json.issueCount).toBe(1)
    expect(json.issues[0].message).toContain('Duplicado')
    expect(createdDocs.length).toBe(0)

    expect(findQueries[0].where).toEqual({
      and: [{ phone: { equals: '+584149876543' } }, { tenant: { equals: 10 } }],
    })
  })

  it('construye condición OR en dedupeWhere si la fila trae tanto correo como whatsapp', async () => {
    const csv = 'Nombre,correo,whatsapp\nEmpresa D,pedro@test.com,+584120001122'
    const { req, findQueries } = createMockRequest({
      csvContent: csv,
      existingDocs: [],
    })

    await importCsvHandler(req)

    expect(findQueries.length).toBe(1)
    expect(findQueries[0].where).toEqual({
      and: [
        {
          or: [{ email: {equals: 'pedro@test.com' } }, { phone: { equals: '+584120001122' } }],
        },
        { tenant: { equals: 10 } },
      ],
    })
  })

  it('usa los mismos valores normalizados (trim + lowercase en email) tanto en find como en create', async () => {
    const csv = 'Nombre,correo,whatsapp\n  Ana Gomez  ,  ANA.GOMEZ@DOMINIO.COM  ,  +58 412 111 2233  '
    const { req, findQueries, createdDocs } = createMockRequest({
      csvContent: csv,
      existingDocs: [],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(json.createdCount).toBe(1)
    expect(findQueries[0].where).toEqual({
      and: [
        {
          or: [
            { email: { equals: 'ana.gomez@dominio.com' } },
            { phone: { equals: '+58 412 111 2233' } },
          ],
        },
        { tenant: { equals: 10 } },
      ],
    })

    expect(createdDocs[0].data.email).toBe('ana.gomez@dominio.com')
    expect(createdDocs[0].data.phone).toBe('+58 412 111 2233')
    expect(createdDocs[0].data.fullName).toBe('Ana Gomez')
    expect(createdDocs[0].data.tenant).toBe(10)
  })

  it('preserva el tenant scoping: no bloquea si el duplicado pertenece a otro tenant', async () => {
    const csv = 'Nombre,correo\nContacto Global,global@test.com'
    const { req, findQueries } = createMockRequest({
      csvContent: csv,
      tenantId: 42,
      existingDocs: [],
    })

    await importCsvHandler(req)
    expect(findQueries[0].where).toEqual({
      and: [{ email: { equals: 'global@test.com' } }, { tenant: { equals: 42 } }],
    })
  })

  it('importación en colección clients mapea campos y deduplica con aliases', async () => {
    const csv = 'Nombre,correo,telefono,Ciudad,Ubicacion,Etapa\nCliente Acme,acme@test.com,+123456,Caracas,Las Mercedes,activo'
    const { req, createdDocs } = createMockRequest({
      csvContent: csv,
      collection: 'clients',
      existingDocs: [],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(json.createdCount).toBe(1)
    expect(createdDocs[0].collection).toBe('clients')
    expect(createdDocs[0].data.name).toBe('Cliente Acme')
    expect(createdDocs[0].data.email).toBe('acme@test.com')
    expect(createdDocs[0].data.phone).toBe('+123456')
    expect(createdDocs[0].data.city).toBe('Caracas')
    expect(createdDocs[0].data.address).toBe('Las Mercedes')
    expect(createdDocs[0].data.stage).toBe('activo')
    expect(createdDocs[0].data.tenant).toBe(10)
  })

  it('resuelve columnas con aliases y formatos de export de Fibery', async () => {
    const csv =
      'Nombre, Fuente, NivelInteres, Prioridad, MontoPotencialUSD, Visitado Presencialmente?, PudoHablarDecisor, Sector Fibery, WhatsApp\n' +
      'Lead Fibery, Llamada fría, Caliente, Alta, 7500, Si, true, Restaurantes, +584128889900'

    const { req, createdDocs } = createMockRequest({
      csvContent: csv,
      collection: 'leads',
      existingDocs: [],
    })

    const res = await importCsvHandler(req)
    const json = await res.json()

    expect(json.createdCount).toBe(1)
    const doc = createdDocs[0].data
    expect(doc.fullName).toBe('Lead Fibery')
    expect(doc.source).toBe('llamada_fria')
    expect(doc.nivelInteres).toBe('caliente')
    expect(doc.prioridad).toBe('alta')
    expect(doc.estimatedValue).toBe(7500)
    expect(doc.visitadoPresencialmente).toBe(true)
    expect(doc.pudoHablarDecisor).toBe(true)
    expect(doc.sectorFibery).toBe('Restaurantes')
    expect(doc.phone).toBe('+584128889900')
  })
})

describe('importCsv — helpers puros', () => {
  it('cleanKey normaliza acentos, mayésculas y caracteres especiales', () => {
    expect(cleanKey('Visitado Presencialmente?')).toBe('visitadopresencialmente')
    expect(cleanKey('°Pudo hablar decisor?')).toBe('pudohablardecisor')
    expect(cleanKey('Teléfono')).toBe('telefono')
    expect(cleanKey('Correo Electrónico')).toBe('correoelectronico')
  })

  it('pick resuelve claves exactas y claves normalizadas', () => {
    const row = {
      'Visitado Presencialmente?': 'Si',
      'Correo Electrónico': 'test@example.com',
      WhatsApp: '+58412123',
    }

    expect(pick(row, 'visitadoPresencialmente')).toBe('Si')
    expect(pick(row, 'email', 'correo', 'correoElectronico')).toBe('test@example.com')
    expect(pick(row, 'phone', 'whatsapp')).toBe('+58412123')
  })

  it('parseBool interpreta variantes afirmativas y negativas en español e inglés', () => {
    expect(parseBool('true')).toBe(true)
    expect(parseBool('Si')).toBe(true)
    expect(parseBool('SÍ')).toBe(true)
    expect(parseBool('1')).toBe(true)
    expect(parseBool('yes')).toBe(true)

    expect(parseBool('false')).toBe(false)
    expect(parseBool('no')).toBe(false)
    expect(parseBool('0')).toBe(false)

    expect(parseBool(undefined)).toBeUndefined()
    expect(parseBool('')).toBeUndefined()
  })

  it('parseDate procesa fechas ISO y formato DD/MM/YYYY con o sin hora', () => {
    expect(parseDate('2026-09-15T12:00:00.000Z')).toBe('2026-09-15T12:00:00.000Z')
    expect(parseDate('15/09/2026')).toBe('2026-09-15T00:00:00.000Z')
    expect(parseDate('15/09/2026 14:30')).toBe('2026-09-15T14:30:00.000Z')
    expect(parseDate('invalido')).toBeUndefined()
    expect(parseDate('')).toBeUndefined()
    expect(parseDate(undefined)).toBeUndefined()
  })

  it('normalizeSource convierte texto de origen a enum válido o manual', () => {
    expect(normalizeSource('Llamada fría')).toBe('llamada_fria')
    expect(normalizeSource('Puerta Fría')).toBe('puerta_fria')
    expect(normalizeSource('Google Maps')).toBe('google_maps')
    expect(normalizeSource('WhatsApp')).toBe('whatsapp')
    expect(normalizeSource('desconocido')).toBe('manual')
    expect(normalizeSource(undefined)).toBe('manual')
  })

  it('normalizeEnum valida contra un Set permitido', () => {
    const set = new Set(['frio', 'templado', 'caliente'] as const)
    expect(normalizeEnum('Caliente', set)).toBe('caliente')
    expect(normalizeEnum('Frío', set)).toBe('frio')
    expect(normalizeEnum('templado', set)).toBe('templado')
    expect(normalizeEnum('otro', set)).toBeUndefined()
  })
})
