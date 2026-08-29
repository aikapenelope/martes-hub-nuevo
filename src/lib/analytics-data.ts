import 'server-only'

import type { Payload, Where } from 'payload'
import type { Activity, Lead, User } from '@/payload-types'
import { paymentsAggregate, startOfMonthIso } from './db-aggregates'

interface AnalyticsOptions {
  payload: Payload
  user: User
  tenantId: number
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  apify: 'Apify',
  tally: 'Tally',
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  referido: 'Referido',
}

const tenantWhere = (tenantId: number, extra?: Where): Where => ({
  and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
})

export interface AnalyticsData {
  funnel: {
    totalLeads: number
    nuevo: number
    contactado: number
    calificado: number
    descartado: number
    convertedToClients: number
    nuevoToContactadoPct: number
    contactadoToCalificadoPct: number
    leadToClientPct: number
  }
  satisfaction: {
    totalSubmissions: number
    complaints: number
    positiveSubmissions: number
    satisfactionRate: number
  }
  sources: Array<{ source: string; label: string; count: number; pct: number }>
  activities: {
    totalMonth: number
    byType: {
      llamada: number
      whatsapp: number
      reunion: number
      email: number
      nota: number
      otro: number
    }
  }
  financials: {
    collectedMonth: number
    pendingCollection: number
    invoicesCount: number
    quotesCount: number
  }
}

export async function getAnalyticsData({ payload, user, tenantId }: AnalyticsOptions): Promise<AnalyticsData> {
  const startOfMonth = startOfMonthIso()

  const [
    leadsTotalRes,
    leadNuevoRes,
    leadContactadoRes,
    leadCalificadoRes,
    leadDescartadoRes,
    leadsConvertedRes,
    formSubmissionsRes,
    formComplaintsRes,
    activitiesMonthRes,
    invoicesRes,
    quotesRes,
    paidMonthAgg,
    pendingAgg,
    allLeadsForSources,
  ] = await Promise.all([
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId) }),
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { status: { equals: 'nuevo' } }) }),
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { status: { equals: 'contactado' } }) }),
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { status: { equals: 'calificado' } }) }),
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { status: { equals: 'descartado' } }) }),
    payload.find({ collection: 'leads', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { convertedClient: { exists: true } }) }),
    payload.find({ collection: 'form-submissions', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId) }),
    payload.find({ collection: 'form-submissions', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { isComplaint: { equals: true } }) }),
    payload.find({
      collection: 'activities',
      limit: 1000,
      overrideAccess: false,
      user,
      select: { type: true, occurredAt: true },
      where: tenantWhere(tenantId, { occurredAt: { greater_than_equal: startOfMonth } }),
    }),
    payload.find({ collection: 'invoices', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId) }),
    payload.find({ collection: 'quotes', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId) }),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonth),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
    payload.find({
      collection: 'leads',
      limit: 500,
      overrideAccess: false,
      user,
      select: { source: true },
      where: tenantWhere(tenantId),
    }),
  ])

  const totalLeads = leadsTotalRes.totalDocs
  const nuevo = leadNuevoRes.totalDocs
  const contactado = leadContactadoRes.totalDocs
  const calificado = leadCalificadoRes.totalDocs
  const descartado = leadDescartadoRes.totalDocs
  const convertedToClients = leadsConvertedRes.totalDocs

  // Progresión en embudo
  const reachedContactado = contactado + calificado + convertedToClients
  const nuevoToContactadoPct = totalLeads > 0 ? Math.round((reachedContactado / totalLeads) * 100) : 0
  const reachedCalificado = calificado + convertedToClients
  const contactadoToCalificadoPct = reachedContactado > 0 ? Math.round((reachedCalificado / reachedContactado) * 100) : 0
  const leadToClientPct = totalLeads > 0 ? Math.round((convertedToClients / totalLeads) * 100) : 0

  // Satisfacción Tally / Formularios
  const totalSubmissions = formSubmissionsRes.totalDocs
  const complaints = formComplaintsRes.totalDocs
  const positiveSubmissions = Math.max(0, totalSubmissions - complaints)
  const satisfactionRate = totalSubmissions > 0 ? Math.round((positiveSubmissions / totalSubmissions) * 100) : 100

  // Desglose de actividades del mes
  const byType = { llamada: 0, whatsapp: 0, reunion: 0, email: 0, nota: 0, otro: 0 }
  for (const doc of activitiesMonthRes.docs as Activity[]) {
    const t = doc.type as keyof typeof byType
    if (t in byType) {
      byType[t] += 1
    } else {
      byType.otro += 1
    }
  }

  // Desglose de canales de leads
  const sourceCounts: Record<string, number> = {}
  for (const doc of allLeadsForSources.docs as Lead[]) {
    const s = doc.source || 'manual'
    sourceCounts[s] = (sourceCounts[s] || 0) + 1
  }

  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      label: SOURCE_LABELS[source] || source,
      count,
      pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    funnel: {
      totalLeads,
      nuevo,
      contactado,
      calificado,
      descartado,
      convertedToClients,
      nuevoToContactadoPct,
      contactadoToCalificadoPct,
      leadToClientPct,
    },
    satisfaction: {
      totalSubmissions,
      complaints,
      positiveSubmissions,
      satisfactionRate,
    },
    sources,
    activities: {
      totalMonth: activitiesMonthRes.totalDocs,
      byType,
    },
    financials: {
      collectedMonth: paidMonthAgg.total,
      pendingCollection: pendingAgg.total,
      invoicesCount: invoicesRes.totalDocs,
      quotesCount: quotesRes.totalDocs,
    },
  }
}
