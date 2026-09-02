import { config as loadDotenv } from 'dotenv'
loadDotenv()

if (process.env.DATABASE_URL_DIRECT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT
}

import { getPayload } from 'payload'

import config from '../src/payload.config.js'

/**
 * Backfill Fase A:
 * 1. Crea `companies` a partir de `companyName` de clients/leads agrupados
 *    por tenant (normalización minúsculas + trim) y vincula la relación `company`.
 * 2. Rellena `email-log.client/lead` por matching del destinatario contra
 *    clients/leads existentes (mismo criterio que el auto-matching de Tally).
 *
 * Idempotente: re-ejecutar no duplica empresas (busca por nombre normalizado
 * + tenant) ni re-vincula email-logs ya enlazados.
 */
async function backfill(): Promise<void> {
  const payload = await getPayload({ config })

  const [clientsRes, leadsRes] = await Promise.all([
    payload.find({ collection: 'clients', limit: 1000, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'leads', limit: 1000, depth: 0, overrideAccess: true }),
  ])

  // ── 1. companies desde companyName ────────────────────────────────────────
  // companyId por clave `${tenantId}:${nombreNormalizado}`
  const companiesByKey = new Map<string, number>()

  const findOrCreateCompany = async (
    tenantId: number,
    rawName: string,
  ): Promise<number | undefined> => {
    const name = rawName.trim()
    if (!name) return undefined
    const key = `${tenantId}:${name.toLowerCase()}`
    const existing = companiesByKey.get(key)
    if (existing) return existing

    const found = await payload.find({
      collection: 'companies',
      where: { and: [{ tenant: { equals: tenantId } }, { name: { equals: name } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (found.docs[0]) {
      companiesByKey.set(key, found.docs[0].id)
      return found.docs[0].id
    }

    const created = await payload.create({
      collection: 'companies',
      data: { tenant: tenantId, name },
      overrideAccess: true,
    })
    companiesByKey.set(key, created.id)
    payload.logger.info({ msg: 'empresa creada', tenantId, name, id: created.id })
    return created.id
  }

  let linkedClients = 0
  for (const client of clientsRes.docs) {
    const tenantId =
      typeof client.tenant === 'object' && client.tenant ? client.tenant.id : client.tenant
    if (!tenantId) continue
    const existingCompanyId =
      typeof client.company === 'object' && client.company ? client.company.id : client.company
    const companyName = client.companyName?.trim()
    if (existingCompanyId || !companyName) continue

    const companyId = await findOrCreateCompany(tenantId, companyName)
    if (companyId) {
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: { company: companyId },
        overrideAccess: true,
      })
      linkedClients += 1
    }
  }

  let linkedLeads = 0
  for (const lead of leadsRes.docs) {
    const tenantId = typeof lead.tenant === 'object' && lead.tenant ? lead.tenant.id : lead.tenant
    if (!tenantId) continue
    const existingCompanyId =
      typeof lead.company === 'object' && lead.company ? lead.company.id : lead.company
    const companyName = lead.companyName?.trim()
    if (existingCompanyId || !companyName) continue

    const companyId = await findOrCreateCompany(tenantId, companyName)
    if (companyId) {
      await payload.update({
        collection: 'leads',
        id: lead.id,
        data: { company: companyId },
        overrideAccess: true,
      })
      linkedLeads += 1
    }
  }

  payload.logger.info({
    msg: 'backfill companies ok',
    companies: companiesByKey.size,
    clientsVinculados: linkedClients,
    leadsVinculados: linkedLeads,
  })

  // ── 2. email-log.client/lead por matching de destinatario ─────────────────
  const clientsByEmail = new Map<string, number>()
  for (const client of clientsRes.docs) {
    if (client.email) clientsByEmail.set(client.email.toLowerCase(), client.id)
  }
  const leadsByEmail = new Map<string, number>()
  for (const lead of leadsRes.docs) {
    if (lead.email) leadsByEmail.set(lead.email.toLowerCase(), lead.id)
  }

  const emailLogs = await payload.find({
    collection: 'email-log',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  let linkedEmails = 0
  for (const log of emailLogs.docs) {
    if (log.client || log.lead) continue
    const email = log.to?.toLowerCase()
    if (!email) continue
    const clientId = clientsByEmail.get(email)
    const leadId = leadsByEmail.get(email)
    if (!clientId && !leadId) continue

    await payload.update({
      collection: 'email-log',
      id: log.id,
      data: { ...(clientId ? { client: clientId } : {}), ...(leadId ? { lead: leadId } : {}) },
      overrideAccess: true,
    })
    linkedEmails += 1
  }

  payload.logger.info({ msg: 'backfill email-log ok', emailsVinculados: linkedEmails })
}

await backfill()
