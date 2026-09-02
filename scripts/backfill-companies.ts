import { config as loadDotenv } from 'dotenv'
loadDotenv()

if (process.env.DATABASE_URL_DIRECT) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT
}

import { getPayload } from 'payload'
import type { Payload, Where } from 'payload'

import config from '../src/payload.config.js'

/**
 * Backfill Fase A (idempotente):
 * 1. Crea `companies` a partir de `companyName` de clients/leads agrupados
 *    por tenant y vincula la relación `company`.
 * 2. Rellena `email-log.client/lead` por matching del destinatario contra
 *    clients/leads existentes (mismo criterio que el auto-matching de Tally).
 *
 * La identidad de empresa es trim + minúsculas dentro de cada tenant: el
 * lookup consulta TODAS las empresas existentes (paginado) con esa clave
 * normalizada, así variantes de mayúsculas ("Acme" vs "acme") no duplican.
 * Re-ejecutar no recrea nada.
 */

const PAGE_SIZE = 500

interface DocLite {
  id: number
  tenant?: number | { id: number } | null
  [key: string]: unknown
}

/** Lee TODAS las páginas de una colección — el backfill no puede quedarse en la primera página. */
async function findAllPaginated(
  payload: Payload,
  collection: string,
  where?: Where,
): Promise<DocLite[]> {
  const docs: DocLite[] = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const res = await payload.find({
      collection: collection as never,
      limit: PAGE_SIZE,
      page,
      depth: 0,
      ...(where ? { where } : {}),
      overrideAccess: true,
    })
    docs.push(...(res.docs as DocLite[]))
    totalPages = res.totalPages ?? 1
    page += 1
  }
  return docs
}

async function backfill(): Promise<void> {
  const payload = await getPayload({ config })

  const [clients, leads, emailLogs, companies] = await Promise.all([
    findAllPaginated(payload, 'clients'),
    findAllPaginated(payload, 'leads'),
    findAllPaginated(payload, 'email-log'),
    findAllPaginated(payload, 'companies'),
  ])

  const tenantIdOf = (doc: DocLite): number | undefined =>
    typeof doc.tenant === 'object' && doc.tenant ? doc.tenant.id : (doc.tenant ?? undefined)

  // ── 1. companies desde companyName ────────────────────────────────────────
  // Clave `${tenantId}:${nombre trim + minúsculas}` — misma para lookup y
  // creación, así las variantes de caso resuelven a la misma empresa.
  const companiesByKey = new Map<string, number>()
  for (const company of companies) {
    const tenantId = tenantIdOf(company)
    const name = typeof company.name === 'string' ? company.name.trim().toLowerCase() : ''
    if (tenantId && name) companiesByKey.set(`${tenantId}:${name}`, company.id)
  }

  let companiesCreated = 0
  let linkedClients = 0
  let linkedLeads = 0

  const findOrCreateCompany = async (tenantId: number, rawName: string): Promise<number | undefined> => {
    const key = `${tenantId}:${rawName.trim().toLowerCase()}`
    const existing = companiesByKey.get(key)
    if (existing) return existing

    const created = await payload.create({
      collection: 'companies',
      data: { tenant: tenantId, name: rawName.trim() },
      overrideAccess: true,
    })
    companiesByKey.set(key, created.id)
    companiesCreated += 1
    payload.logger.info({ msg: 'empresa creada', tenantId, name: rawName.trim(), id: created.id })
    return created.id
  }

  for (const client of clients) {
    const tenantId = tenantIdOf(client)
    const companyName = typeof client.companyName === 'string' ? client.companyName.trim() : ''
    const alreadyLinked = Boolean(client.company)
    if (!tenantId || alreadyLinked || !companyName) continue

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

  for (const lead of leads) {
    const tenantId = tenantIdOf(lead)
    const companyName = typeof lead.companyName === 'string' ? lead.companyName.trim() : ''
    const alreadyLinked = Boolean(lead.company)
    if (!tenantId || alreadyLinked || !companyName) continue

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
    empresasExistentes: companies.length,
    empresasCreadas: companiesCreated,
    clientsVinculados: linkedClients,
    leadsVinculados: linkedLeads,
  })

  // ── 2. email-log.client/lead por matching de destinatario ─────────────────
  const clientsByEmail = new Map<string, number>()
  for (const client of clients) {
    const email = typeof client.email === 'string' ? client.email.toLowerCase() : ''
    if (email) clientsByEmail.set(email, client.id)
  }
  const leadsByEmail = new Map<string, number>()
  for (const lead of leads) {
    const email = typeof lead.email === 'string' ? lead.email.toLowerCase() : ''
    if (email) leadsByEmail.set(email, lead.id)
  }

  let linkedEmails = 0
  for (const log of emailLogs) {
    if (log.client || log.lead) continue
    const email = typeof log.to === 'string' ? log.to.toLowerCase() : ''
    if (!email) continue
    // Precedencia del cliente: si la dirección matchea a un cliente, el email
    // es SU historial — no se cuelga también del lead para que el lead no
    // muestre historial que ya no le pertenece (Devin review).
    const clientId = clientsByEmail.get(email)
    const leadId = clientId ? undefined : leadsByEmail.get(email)
    if (!clientId && !leadId) continue

    await payload.update({
      collection: 'email-log',
      id: log.id,
      data: { ...(clientId ? { client: clientId } : {}), ...(leadId ? { lead: leadId } : {}) },
      overrideAccess: true,
    })
    linkedEmails += 1
  }

  payload.logger.info({
    msg: 'backfill email-log ok',
    emailsRevisados: emailLogs.length,
    emailsVinculados: linkedEmails,
  })
}

await backfill()
