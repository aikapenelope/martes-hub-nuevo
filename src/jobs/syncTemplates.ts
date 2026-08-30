import type { TaskConfig } from 'payload'
import { isConfigured, listTemplates } from '../integrations/openbsp/client'

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

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (tenants.docs.length === 0) {
      return { output: { synced: 0, skippedReason: 'sin tenants configurados' } }
    }

    let templates
    try {
      templates = await listTemplates()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido'
      for (const tenant of tenants.docs) {
        await req.payload.create({
          collection: 'notifications',
          data: {
            title: 'Sync de plantillas falló',
            body: message,
            severity: 'info',
            source: 'openbsp',
            read: false,
            tenant: tenant.id,
          },
          overrideAccess: true,
          req,
        })
      }
      return { output: { synced: 0, skippedReason: message } }
    }

    let totalSynced = 0
    for (const tenant of tenants.docs) {
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
          req,
        })

        const data = {
          name,
          language,
          category: (t.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | undefined) || undefined,
          metaStatus:
            (t.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | undefined) ||
            undefined,
          openbspTemplateId: String(t.id ?? ''),
          componentsJson: t.components ?? {},
          tenant: tenant.id,
        }

        if (existing.docs[0]) {
          await req.payload.update({
            collection: 'message-templates',
            id: existing.docs[0].id,
            data,
            overrideAccess: true,
            req,
          })
        } else {
          await req.payload.create({
            collection: 'message-templates',
            data,
            overrideAccess: true,
            req,
          })
        }
        totalSynced += 1
      }
    }

    req.payload.logger.info({ msg: 'sync-templates completado', synced: totalSynced })
    return { output: { synced: totalSynced, skippedReason: '' } }
  },
}

