import 'server-only'

import type { Payload, Where } from 'payload'
import type { Activity, User } from '@/payload-types'
import { paymentsAggregate, quotesAggregate, startOfMonthIso } from './db-aggregates'

interface AnalyticsOptions {
  payload: Payload
  user: User
  tenantId: number
}

export const ALL_LEAD_SOURCES = [
  'manual',
  'google_maps',
  'puerta_fria',
  'whatsapp',
  'instagram_dm',
  'linkedin',
  'tally',
  'apify',
  'referido',
] as const

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  google_maps: 'Google Maps',
  puerta_fria: 'Puerta Fría',
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram DM',
  linkedin: 'LinkedIn',
  tally: 'Formulario Web',
  apify: 'Apify Scraper',
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
  clientsByStage: Array<{ label: string; value: number }>
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
  tasks: {
    completedMonth: number
    pendingTotal: number
    overdueTotal: number
    completionRate: number
  }
  financials: {
    collectedMonth: number
    pendingCollection: number
    invoicesCount: number
    quotesCount: number
    quotesActiveTotal: number
    collectionRate: number
  }
}

export async function getAnalyticsData({ payload, user, tenantId }: AnalyticsOptions): Promise<AnalyticsData> {
  const startOfMonth = startOfMonthIso()
  const todayStr = new Date().toISOString().slice(0, 10)

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
    quotesActiveAgg,
    clientsNuevoRes,
    clientsActivoRes,
    clientsInactivoRes,
    clientsPerdidoRes,
    tasksCompletedMonthRes,
    tasksPendingRes,
    tasksOverdueRes,
    ...sourceResList
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
    quotesAggregate(payload, tenantId, ['borrador', 'enviada', 'aceptada']),
    payload.find({ collection: 'clients', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { stage: { equals: 'nuevo' } }) }),
    payload.find({ collection: 'clients', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { stage: { equals: 'activo' } }) }),
    payload.find({ collection: 'clients', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { stage: { equals: 'inactivo' } }) }),
    payload.find({ collection: 'clients', limit: 0, overrideAccess: false, user, where: tenantWhere(tenantId, { stage: { equals: 'perdido' } }) }),
    payload.find({
      collection: 'tasks',
      limit: 0,
      overrideAccess: false,
      user,
      where: tenantWhere(tenantId, {
        and: [{ status: { equals: 'completada' } }, { updatedAt: { greater_than_equal: startOfMonth } }],
      }),
    }),
    payload.find({
      collection: 'tasks',
      limit: 0,
      overrideAccess: false,
      user,
      where: tenantWhere(tenantId, { status: { in: ['pendiente', 'en_progreso', 'bloqueada'] } }),
    }),
    payload.find({
      collection: 'tasks',
      limit: 0,
      overrideAccess: false,
      user,
      where: tenantWhere(tenantId, {
        and: [{ dueDate: { less_than: todayStr } }, { status: { not_in: ['completada', 'cancelada'] } }],
      }),
    }),
    ...ALL_LEAD_SOURCES.map((source) =>
      payload.find({
        collection: 'leads',
        limit: 0,
        overrideAccess: false,
        user,
        where: tenantWhere(tenantId, { source: { equals: source } }),
      }),
    ),
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

  // Desglose exacto de canales de leads
  const sources = ALL_LEAD_SOURCES.map((source, idx) => {
    const count = sourceResList[idx]?.totalDocs ?? 0
    return {
      source,
      label: SOURCE_LABELS[source] || source,
      count,
      pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
    }
  })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalInvoicedPeriod = paidMonthAgg.total + pendingAgg.total
  const collectionRate = totalInvoicedPeriod > 0 ? Math.round((paidMonthAgg.total / totalInvoicedPeriod) * 100) : 0

  const tasksCompletedMonth = tasksCompletedMonthRes.totalDocs
  const tasksPendingTotal = tasksPendingRes.totalDocs
  const tasksOverdueTotal = tasksOverdueRes.totalDocs
  const taskDenom = tasksCompletedMonth + tasksPendingTotal
  const taskCompletionRate = taskDenom > 0 ? Math.round((tasksCompletedMonth / taskDenom) * 100) : 100

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
    clientsByStage: [
      { label: 'Nuevo', value: clientsNuevoRes.totalDocs },
      { label: 'Activo', value: clientsActivoRes.totalDocs },
      { label: 'Inactivo', value: clientsInactivoRes.totalDocs },
      { label: 'Perdido', value: clientsPerdidoRes.totalDocs },
    ].filter((s) => s.value > 0),
    activities: {
      totalMonth: activitiesMonthRes.totalDocs,
      byType,
    },
    tasks: {
      completedMonth: tasksCompletedMonth,
      pendingTotal: tasksPendingTotal,
      overdueTotal: tasksOverdueTotal,
      completionRate: taskCompletionRate,
    },
    financials: {
      collectedMonth: paidMonthAgg.total,
      pendingCollection: pendingAgg.total,
      invoicesCount: invoicesRes.totalDocs,
      quotesCount: quotesRes.totalDocs,
      quotesActiveTotal: quotesActiveAgg.total,
      collectionRate,
    },
  }
}
