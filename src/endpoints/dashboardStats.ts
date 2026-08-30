import type { PayloadRequest } from 'payload'
import type { User } from '@/payload-types'
import { paymentsAggregate, startOfMonthIso } from '../lib/db-aggregates'
import { resolveUserTenantId } from './tenantResolution'

export async function dashboardStatsHandler(req: PayloadRequest): Promise<Response> {
  const user = req.user as User | null
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  const tenantId = await resolveUserTenantId(req, 'http://localhost/api/dashboard/stats')

  if (!tenantId) {
    return Response.json({
      leadsTotal: 0,
      leadBars: [0, 0, 0, 0],
      cobrosAbiertos: 0,
      cobrosAbiertosUsd: 0,
      pctCobradoMes: 0,
      sinResponder: 0,
      respBars: [0, 0, 0],
    })
  }

  const now = Date.now()
  const startOfMonth = startOfMonthIso()
  const fourHoursAgo = new Date(now - 4 * 3600000).toISOString()
  const twentyFourHoursAgo = new Date(now - 24 * 3600000).toISOString()
  const seventyTwoHoursAgo = new Date(now - 72 * 3600000).toISOString()

  const [
    leadsTotalRes,
    leadNuevoRes,
    leadContactadoRes,
    leadCalificadoRes,
    leadDescartadoRes,
    cobrosAbiertosRes,
    cobrosAbiertosAgg,
    cobrosMesPagadoAgg,
    cobrosMesPendienteAgg,
    sinResponderRes,
    h4To24Res,
    h24To72Res,
  ] = await Promise.all([
    req.payload.find({
      collection: 'leads',
      where: { tenant: { equals: tenantId } },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'nuevo' } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'contactado' } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'calificado' } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'descartado' } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'payments',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { in: ['pendiente', 'vencido'] } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    paymentsAggregate(req.payload, tenantId, ['pendiente', 'vencido']),
    paymentsAggregate(req.payload, tenantId, ['pagado'], startOfMonth),
    paymentsAggregate(req.payload, tenantId, ['pendiente', 'vencido'], startOfMonth),
    req.payload.find({
      collection: 'conversations',
      where: { and: [{ tenant: { equals: tenantId } }, { lastInboundAt: { less_than_equal: fourHoursAgo } }] },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'conversations',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { lastInboundAt: { less_than_equal: fourHoursAgo } },
          { lastInboundAt: { greater_than_equal: twentyFourHoursAgo } },
        ],
      },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
    req.payload.find({
      collection: 'conversations',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { lastInboundAt: { less_than_equal: twentyFourHoursAgo } },
          { lastInboundAt: { greater_than_equal: seventyTwoHoursAgo } },
        ],
      },
      limit: 0,
      overrideAccess: false,
      user,
      req,
    }),
  ])

  const totalMes = cobrosMesPagadoAgg.total + cobrosMesPendienteAgg.total
  const pctCobradoMes = totalMes > 0 ? Math.round((cobrosMesPagadoAgg.total / totalMes) * 100) : 0

  const sinResponder = sinResponderRes.totalDocs
  const h4 = h4To24Res.totalDocs
  const h24 = h24To72Res.totalDocs
  const h72Plus = Math.max(0, sinResponder - h4 - h24)

  return Response.json({
    leadsTotal: leadsTotalRes.totalDocs,
    leadBars: [
      leadNuevoRes.totalDocs,
      leadContactadoRes.totalDocs,
      leadCalificadoRes.totalDocs,
      leadDescartadoRes.totalDocs,
    ],
    cobrosAbiertos: cobrosAbiertosRes.totalDocs,
    cobrosAbiertosUsd: cobrosAbiertosAgg.total,
    pctCobradoMes,
    sinResponder,
    respBars: [h4, h24, h72Plus],
  })
}
