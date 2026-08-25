import { parse } from 'csv-parse/sync'
import type { PayloadRequest, Where } from 'payload'
import type { User } from '@/payload-types'

const IMPORTABLE = new Set(['clients', 'leads'])
const EDITOR_ROLES = ['admin', 'agente']

type CsvRow = Record<string, string>

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

      const email = raw.email || undefined
      const phone = raw.phone || raw.telefono || undefined

      if (collection === 'clients') {
        const doc = await req.payload.create({
          collection: 'clients',
          data: {
            name,
            stage: (raw.stage as 'nuevo' | 'activo' | 'inactivo' | 'perdido') || 'nuevo',
            email,
            phone,
            tenant: tenantId,
          },
          overrideAccess: false,
          user,
        })
        createdIds.push(doc.id)
      } else {
        const doc = await req.payload.create({
          collection: 'leads',
          data: {
            fullName: name,
            status: (raw.status as 'nuevo' | 'contactado' | 'calificado' | 'descartado') || 'nuevo',
            source:
              (raw.source as 'manual' | 'apify' | 'tally' | 'whatsapp' | 'instagram_dm' | 'referido') ||
              'manual',
            email,
            phone,
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
