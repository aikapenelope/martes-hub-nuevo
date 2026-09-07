import { parse } from 'csv-parse/sync'
import type { PayloadRequest, Where } from 'payload'
import type { User } from '@/payload-types'

const IMPORTABLE = new Set(['clients', 'leads'])
const EDITOR_ROLES = ['admin', 'agente']
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 1000

type CsvRow = Record<string, string>

/** Primer alias presente y no vacío (los headers del export varían entre CRMs). */
function pick(row: CsvRow, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (value && value.trim()) return value.trim()
  }
  return undefined
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

type LeadSource =
  | 'manual'
  | 'google_maps'
  | 'puerta_fria'
  | 'llamada_fria'
  | 'whatsapp'
  | 'instagram_dm'
  | 'linkedin'
  | 'tally'
  | 'apify'
  | 'referido'

const SOURCES = new Set<LeadSource>([
  'manual',
  'google_maps',
  'puerta_fria',
  'llamada_fria',
  'whatsapp',
  'instagram_dm',
  'linkedin',
  'tally',
  'apify',
  'referido',
])

/** Normaliza 'Llamada fría' → llamada_fria; valores desconocidos → manual. */
function normalizeSource(value: string | undefined): LeadSource {
  if (!value) return 'manual'
  const normalized = stripAccents(value.toLowerCase()).replace(/\s+/g, '_') as LeadSource
  return SOURCES.has(normalized) ? normalized : 'manual'
}

type NivelInteres = 'frio' | 'templado' | 'caliente'
type Prioridad = 'baja' | 'media' | 'alta'

const NIVELES = new Set<NivelInteres>(['frio', 'templado', 'caliente'])
const PRIORIDADES = new Set<Prioridad>(['baja', 'media', 'alta'])

function normalizeEnum<T extends string>(value: string | undefined, allowed: Set<T>): T | undefined {
  if (!value) return undefined
  const normalized = stripAccents(value.toLowerCase()).replace(/\s+/g, '_') as T
  return allowed.has(normalized) ? normalized : undefined
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

function firstTenantId(user: User): number | null {
  const membership = user.tenants?.[0]?.tenant
  if (!membership) return null
  return typeof membership === 'object' ? membership.id : membership
}

export async function importCsvHandler(req: PayloadRequest): Promise<Response> {
  const url = new URL(req.url ?? 'http://local.payload/import-csv')
  const requested = url.searchParams.get('collection') ?? ''

  if (!IMPORTABLE.has(requested)) {
    return Response.json(
      { error: `Colección no importable: "${requested}". Permitidas: clients, leads` },
      { status: 400 },
    )
  }
  // Validado contra IMPORTABLE arriba; estrechamiento a los slugs permitidos
  const collection = requested as 'clients' | 'leads'

  const user = req.user as User | null
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!user.roles?.some((r) => EDITOR_ROLES.includes(r))) {
    return Response.json({ error: 'Requiere rol admin o agente' }, { status: 403 })
  }
  const tenantId = firstTenantId(user)
  if (!tenantId) {
    return Response.json({ error: 'Usuario sin tenant asignado' }, { status: 422 })
  }

  const parseForm = req.formData
  if (typeof parseForm !== 'function') {
    return Response.json({ error: 'Se requiere multipart/form-data' }, { status: 400 })
  }

  let form: FormData
  try {
    form = await parseForm.call(req)
  } catch {
    return Response.json({ error: 'Cuerpo multipart inválido' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'Falta el archivo CSV en el campo "file"' }, { status: 400 })
  }
  // DoS: sin este límite, un archivo enorme podía agotar memoria/CPU parseándolo entero.
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: `El archivo excede el máximo permitido (${MAX_FILE_BYTES / 1024 / 1024} MB)` }, { status: 413 })
  }

  let rows: CsvRow[]
  try {
    rows = parse(await file.text(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as CsvRow[]
  } catch {
    return Response.json({ error: 'CSV inválido' }, { status: 400 })
  }
  if (rows.length > MAX_ROWS) {
    return Response.json({ error: `El CSV excede el máximo de ${MAX_ROWS} filas por importación` }, { status: 413 })
  }

  const createdIds: Array<number | string> = []
  const issues: Array<{ row: number; message: string }> = []

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 2
    try {
      const name = raw.name || raw.fullName || raw.nombre
      if (!name) throw new Error('Falta columna obligatoria name/fullName')

      let dedupeWhere: Where | null = null
      if (raw.email) {
        dedupeWhere = {
          and: [{ email: { equals: raw.email.toLowerCase() } }, { tenant: { equals: tenantId } }],
        }
      } else if (raw.phone) {
        dedupeWhere = {
          and: [{ phone: { equals: raw.phone } }, { tenant: { equals: tenantId } }],
        }
      }

      if (dedupeWhere) {
        const existing = await req.payload.find({
          collection,
          where: dedupeWhere,
          limit: 1,
          depth: 0,
          overrideAccess: false,
          user,
        })
        if (existing.docs.length > 0) {
          issues.push({ row: rowNumber, message: 'Duplicado (email/teléfono ya existe en este tenant)' })
          continue
        }
      }

      const email = pick(raw, 'email', 'correo')
      const phone = pick(raw, 'phone', 'telefono', 'whatsapp')

      if (collection === 'clients') {
        const doc = await req.payload.create({
          collection: 'clients',
          data: {
            name,
            stage: (pick(raw, 'stage', 'etapa') as 'nuevo' | 'activo' | 'inactivo' | 'perdido') || 'nuevo',
            email,
            phone,
            city: pick(raw, 'city', 'ciudad'),
            address: pick(raw, 'address', 'direccion', 'ubicacion'),
            tenant: tenantId,
          },
          overrideAccess: false,
          user,
        })
        createdIds.push(doc.id)
      } else {
        // Upsert/mapeo completo en Sprint 2 del plan de fase final — hoy: crea
        // con mapeo ampliado de columnas (export Fibery incluido).
        const doc = await req.payload.create({
          collection: 'leads',
          data: {
            fullName: name,
            status: (pick(raw, 'status', 'estado') as 'nuevo' | 'contactado' | 'calificado' | 'descartado') || 'nuevo',
            source: normalizeSource(pick(raw, 'source', 'fuente')),
            email,
            phone,
            city: pick(raw, 'city', 'ciudad'),
            address: pick(raw, 'address', 'direccion', 'ubicacion'),
            socialHandle: pick(raw, 'socialHandle', 'instagram', 'redSocial'),
            website: pick(raw, 'website', 'sitioWeb'),
            whatsappLink: pick(raw, 'whatsappLink', 'whatsapp link'),
            estimatedValue: Number(pick(raw, 'estimatedValue', 'montoPotencialUSD', 'montoPotencial')) || undefined,
            nivelInteres: normalizeEnum(pick(raw, 'nivelInteres', 'nivelInterés'), NIVELES),
            prioridad: normalizeEnum(pick(raw, 'prioridad'), PRIORIDADES),
            servicioInteres: pick(raw, 'servicioInteres', 'servicioInterés'),
            personaInteres: pick(raw, 'personaInteres', 'personaInterés'),
            identificador: pick(raw, 'identificador', 'id'),
            sectorFibery: pick(raw, 'sectorFibery', 'sector fibery', 'sector'),
            numeroDeLlamadas: Number(pick(raw, 'numeroDeLlamadas')) || 0,
            lastContactedAt: parseDate(pick(raw, 'lastContactedAt', 'ultimaLlamada')),
            fechaProximaLlamada: parseDate(pick(raw, 'fechaProximaLlamada')),
            visitadoPresencialmente: pick(raw, 'visitadoPresencialmente')?.toLowerCase() === 'true' || undefined,
            pudoHablarDecisor: pick(raw, 'pudoHablarDecisor')?.toLowerCase() === 'true' || undefined,
            notasLlamada: pick(raw, 'notasLlamada'),
            notes: pick(raw, 'notes', 'notas'),
            tenant: tenantId,
          },
          overrideAccess: false,
          user,
        })
        createdIds.push(doc.id)
      }
    } catch (err) {
      issues.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
  }

  return Response.json({
    collection,
    totalRows: rows.length,
    createdCount: createdIds.length,
    issueCount: issues.length,
    createdIds,
    issues,
  })
}
