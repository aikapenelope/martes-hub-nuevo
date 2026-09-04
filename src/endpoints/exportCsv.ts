import type { PayloadRequest } from 'payload'
import type { Client, Lead, User } from '@/payload-types'

const EXPORTABLE = new Set(['clients', 'leads'])
const EDITOR_ROLES = ['admin', 'agente']

function firstTenantId(user: User): number | null {
  const membership = user.tenants?.[0]?.tenant
  if (!membership) return null
  return typeof membership === 'object' ? membership.id : membership
}

/**
 * Escapa un valor para CSV: envuelve en comillas si tiene coma, comilla o
 * salto de línea, y neutraliza CSV/formula injection (OWASP): una celda que
 * empieza con `=` `+` `-` `@` (o tab/CR) se interpreta como fórmula por
 * Excel/LibreOffice/Sheets al abrir el export. El prefijo `'` la fuerza a
 * texto plano.
 */
export function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

/**
 * Exportación nativa de CSV para el workspace — evita depender de la UI de
 * `@payloadcms/plugin-import-export` (que vive en `/admin`, fuera del
 * producto). Alcance intencionalmente simple: solo las columnas que ya se
 * muestran en la tabla del CRM, sin colas de jobs ni archivos generados.
 */
export async function exportCsvHandler(req: PayloadRequest): Promise<Response> {
  const url = new URL(req.url ?? 'http://local.payload/export-csv')
  const requested = url.searchParams.get('collection') ?? ''

  if (!EXPORTABLE.has(requested)) {
    return Response.json(
      { error: `Colección no exportable: "${requested}". Permitidas: clients, leads` },
      { status: 400 },
    )
  }
  const collection = requested as 'clients' | 'leads'

  const user = req.user as User | null
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.roles?.some((r) => EDITOR_ROLES.includes(r))) {
    return Response.json({ error: 'Requiere rol admin o agente' }, { status: 403 })
  }
  const tenantId = firstTenantId(user)
  if (!tenantId) return Response.json({ error: 'Usuario sin tenant asignado' }, { status: 422 })

  let rows: string[][]
  if (collection === 'clients') {
    const result = await req.payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenantId } },
      limit: 5000,
      depth: 0,
      overrideAccess: false,
      user,
    })
    const docs = result.docs as Client[]
    rows = [
      ['name', 'email', 'phone', 'stage', 'notes'],
      ...docs.map((c) => [c.name, c.email ?? '', c.phone ?? '', c.stage, c.notes ?? '']),
    ]
  } else {
    const result = await req.payload.find({
      collection: 'leads',
      where: { tenant: { equals: tenantId } },
      limit: 5000,
      depth: 0,
      overrideAccess: false,
      user,
    })
    const docs = result.docs as Lead[]
    rows = [
      ['fullName', 'email', 'phone', 'status', 'source', 'notes'],
      ...docs.map((l) => [l.fullName, l.email ?? '', l.phone ?? '', l.status, l.source, l.notes ?? '']),
    ]
  }

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${collection}-export.csv"`,
    },
  })
}
