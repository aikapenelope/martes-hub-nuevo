import type { PayloadRequest, TaskConfig } from 'payload'
import type { Tenant } from '@/payload-types'
import { isConfigured, listTemplates } from '../integrations/openbsp/client'

async function resolveTenant(req: PayloadRequest): Promise<Tenant | null> {
  const all = await req.payload.find({ collection: 'tenants', limit: 2, depth: 0 })
  if (all.totalDocs === 1) return all.docs[0]
  return null
}

async function notify(req: PayloadRequest, tenantId: number | undefined, title: string, body?: string): Promise<void> {
  await req.payload.create({
    collection: 'notifications',
    data: { title, body, severity: 'info' as const, source: 'openbsp', read: false, ...(tenantId ? { tenant: tenantId } : {}) },
    overrideAccess: true,
  })
}

export const syncTemplatesTask: TaskConfig = {
  slug: 'sync-templates',
  label: 'Sincronizar plantillas WhatsApp',
  schedule: [{ cron: '30 12 * * *', queue: 'dinero' }],
  inputSchema: [],
  outputSchema: [
    { name: 'synced', type: 'number' },
    { name: 'skippedReason', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!isConfigured()) {
      return { output: { synced: 0, skippedReason: 'OpenBSP no configurado todavía' } }
    }

    const tenant = await resolveTenant(req)
    if (!tenant) return { output: { synced: 0, skippedReason: 'sin tenant resoluble' } }

    let templates
    try {
      templates = await listTemplates()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido'
      await notify(req, tenant.id, 'Sync de plantillas falló', message)
      return { output: { synced: 0, skippedReason: message } }
    }

    let synced = 0
    for (const t of templates) {
      const name = String(t.name ?? '')
      if (!name) continue
      const language =
        typeof t.language === 'object' && t.language !== null
          ? String(t.language.code ?? '')
          : String(t.language ?? '')

      const existing = await req.payload.find({
        collection: 'message-templates',
        where: {
          and: [
            { name: { equals: name } },
            { language: { equals: language } },
            { tenant: { equals: tenant.id } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      const data = {
        name,
        language,
        category: (t.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | undefined) || undefined,
        metaStatus: (t.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | undefined) || undefined,
        openbspTemplateId: String(t.id ?? ''),
        componentsJson: (t.components as unknown as Record<string, unknown>) ?? {},
        tenant: tenant.id,
      }

      if (existing.docs[0]) {
        await req.payload.update({
          collection: 'message-templates',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
      } else {
        await req.payload.create({
          collection: 'message-templates',
          data,
          overrideAccess: true,
        })
      }
      synced += 1
    }

    req.payload.logger.info({ msg: 'sync-templates completado', synced })
    return { output: { synced, skippedReason: '' } }
  },
}
