import type { TaskConfig } from 'payload'
import { isConfigured } from '../integrations/openbsp/client'

const SUPABASE_URL = process.env.OPENBSP_SUPABASE_URL || 'https://nheelwshzbgenpavwhcy.supabase.co'

interface LogRow {
  id?: string
  level: string
  category?: string
  service?: string
  message: string
  metadata?: Record<string, unknown>
  created_at: string
}

async function fetchErrorLogs(): Promise<LogRow[]> {
  const key = process.env.OPENBSP_API_KEY
  const publishable = process.env.OPENBSP_PUBLISHABLE_KEY
  if (!key || !publishable) throw new Error('OpenBSP no configurado')

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/logs?level=eq.error&order=created_at.desc&limit=20&select=id,level,category,service,message,metadata,created_at`,
    { headers: { apikey: publishable, 'api-key': key } },
  )
  if (!res.ok) throw new Error(`OpenBSP ${res.status} al leer logs`)
  return (await res.json()) as LogRow[]
}

export const openbspErrorsTask: TaskConfig = {
  slug: 'openbsp-error-poll',
  label: 'Poll de errores Meta/OpenBSP',
  schedule: [{ cron: '0 */6 * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'notified', type: 'number' },
    { name: 'skippedReason', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!isConfigured()) {
      return { output: { notified: 0, skippedReason: 'OpenBSP no configurado todavía' } }
    }

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (tenants.docs.length === 0) {
      return { output: { notified: 0, skippedReason: 'sin tenants configurados' } }
    }

    let rows: LogRow[]
    try {
      rows = await fetchErrorLogs()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido'
      return { output: { notified: 0, skippedReason: message } }
    }

    // Identificadores por tenant para atribuir cada log de OpenBSP al tenant
    // correcto (el stream de logs es global a la instancia OpenBSP): el phone
    // number / organización del tenant debe aparecer en el mensaje o metadata.
    const tenantIdentifiers = tenants.docs.map((tenant) => ({
      tenant,
      ids: [tenant.openbspPhoneNumberId, tenant.openbspOrganizationId].filter(
        (id): id is string => Boolean(id),
      ),
    }))

    const findMatchingTenants = (row: LogRow) => {
      const haystack = JSON.stringify({ message: row.message, metadata: row.metadata })
      return tenantIdentifiers.filter(({ ids }) => ids.some((id) => haystack.includes(id)))
    }

    let notified = 0
    for (const row of rows) {
      const title = `[OpenBSP] ${row.category ?? row.service ?? 'error'}`
      const body = `${row.message} (${row.created_at})`

      const matched = findMatchingTenants(row)

      if (matched.length > 0) {
        // Incidente atribuible: una notificación por cada tenant coincidente.
        for (const { tenant } of matched) {
          const dupes = await req.payload.count({
            collection: 'notifications',
            where: {
              and: [
                { title: { equals: title } },
                { body: { equals: body } },
                { tenant: { equals: tenant.id } },
              ],
            },
            overrideAccess: true,
            req,
          })
          if (dupes.totalDocs > 0) continue

          await req.payload.create({
            collection: 'notifications',
            data: {
              title,
              body,
              severity: 'error',
              source: 'openbsp',
              occurredAt: row.created_at,
              read: false,
              tenant: tenant.id,
            },
            overrideAccess: true,
            req,
          })
          notified += 1
        }
        continue
      }

      // Incidente global de plataforma (sin tenant identificable): una sola
      // notificación sin tenant en lugar de duplicarla en la salud de todos.
      const dupes = await req.payload.count({
        collection: 'notifications',
        where: {
          and: [{ title: { equals: title } }, { body: { equals: body } }, { tenant: { exists: false } }],
        },
        overrideAccess: true,
        req,
      })
      if (dupes.totalDocs > 0) continue

      await req.payload.create({
        collection: 'notifications',
        data: {
          title,
          body,
          severity: 'error',
          source: 'openbsp',
          occurredAt: row.created_at,
          read: false,
        },
        overrideAccess: true,
        req,
      })
      notified += 1
    }

    if (notified > 0) req.payload.logger.warn({ msg: 'openbsp-error-poll', notified })
    return { output: { notified, skippedReason: '' } }
  },
}

