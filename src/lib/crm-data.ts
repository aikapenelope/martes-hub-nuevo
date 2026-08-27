import 'server-only'

import type { Payload, Where } from 'payload'
import type { Activity, Client, Lead, User } from '@/payload-types'
import {
  CLIENT_STAGES,
  LEAD_STATUSES,
  type ClientStage,
  type CrmFilters,
  type CrmView,
  type LeadStatus,
} from '@/lib/crm-filters'

const PAGE_SIZE = 20

export type { ClientStage, CrmFilters, CrmSearchParams, CrmView, LeadStatus } from '@/lib/crm-filters'
export { CLIENT_STAGES, CRM_VIEWS, LEAD_STATUSES, parseCrmFilters } from '@/lib/crm-filters'

function tenantWhere(tenantId: number, extra: Where[]): Where {
  return { and: [{ tenant: { equals: tenantId } }, ...extra] }
}

function leadSearchWhere(query: string): Where[] {
  if (!query) return []
  return [
    {
      or: [
        { fullName: { like: query } },
        { email: { like: query } },
        { phone: { like: query } },
      ],
    },
  ]
}

function clientSearchWhere(query: string): Where[] {
  if (!query) return []
  return [
    {
      or: [
        { name: { like: query } },
        { email: { like: query } },
        { phone: { like: query } },
      ],
    },
  ]
}

export interface CrmDataOptions {
  payload: Payload
  user: User
  tenantId: number
  filters: CrmFilters
}

export interface CrmPagination {
  page: number
  totalPages: number
  totalDocs: number
  hasPrevPage: boolean
  hasNextPage: boolean
}

export interface CrmData {
  view: CrmView
  pipeline: { status: LeadStatus; total: number }[]
  stages: { stage: ClientStage; total: number }[]
  leads: Lead[]
  clients: Client[]
  pagination: CrmPagination
  totals: { leads: number; clients: number }
}

/**
 * Contrato agregado de CRM: pipeline + tabla paginada del tenant activo.
 * Cada consulta lleva user, overrideAccess:false, tenant, limit y select.
 */
export async function getCrmData({ payload, user, tenantId, filters }: CrmDataOptions): Promise<CrmData> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  if (filters.view === 'clientes') {
    const stageFilter: Where[] =
      filters.stage === 'todos' ? [] : [{ stage: { equals: filters.stage } }]

    const [clientsResult, leadsCount, ...stageCounts] = await Promise.all([
      query({
        collection: 'clients',
        depth: 1,
        limit: PAGE_SIZE,
        page: filters.page,
        sort: '-updatedAt',
        where: tenantWhere(tenantId, [...stageFilter, ...clientSearchWhere(filters.query)]),
        select: {
          name: true,
          stage: true,
          email: true,
          phone: true,
          segment: true,
          assignedAgent: true,
          optOutAt: true,
          updatedAt: true,
        },
      }),
      query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, [{ status: { not_equals: 'descartado' } }]) }),
      ...CLIENT_STAGES.map((stage) =>
        query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, [{ stage: { equals: stage } }]) }),
      ),
    ])

    return {
      view: 'clientes',
      pipeline: [],
      stages: CLIENT_STAGES.map((stage, index) => ({ stage, total: stageCounts[index].totalDocs })),
      leads: [],
      clients: clientsResult.docs as Client[],
      pagination: {
        page: clientsResult.page ?? 1,
        totalPages: clientsResult.totalPages ?? 1,
        totalDocs: clientsResult.totalDocs ?? 0,
        hasPrevPage: clientsResult.hasPrevPage ?? false,
        hasNextPage: clientsResult.hasNextPage ?? false,
      },
      totals: { leads: leadsCount.totalDocs, clients: stageCounts.reduce((sum, r) => sum + r.totalDocs, 0) },
    }
  }

  const statusFilter: Where[] =
    filters.status === 'todos' ? [] : [{ status: { equals: filters.status } }]

  const [leadsResult, clientsCount, ...pipelineCounts] = await Promise.all([
    query({
      collection: 'leads',
      depth: 1,
      limit: PAGE_SIZE,
      page: filters.page,
      sort: '-createdAt',
      where: tenantWhere(tenantId, [...statusFilter, ...leadSearchWhere(filters.query)]),
      select: {
        fullName: true,
        status: true,
        source: true,
        email: true,
        phone: true,
        segment: true,
        convertedClient: true,
        createdAt: true,
      },
    }),
    query({ collection: 'clients', limit: 0, where: tenantWhere(tenantId, [{ stage: { equals: 'activo' } }]) }),
    ...LEAD_STATUSES.map((status) =>
      query({ collection: 'leads', limit: 0, where: tenantWhere(tenantId, [{ status: { equals: status } }]) }),
    ),
  ])

  return {
    view: 'leads',
    pipeline: LEAD_STATUSES.map((status, index) => ({ status, total: pipelineCounts[index].totalDocs })),
    stages: [],
    leads: leadsResult.docs as Lead[],
    clients: [],
    pagination: {
      page: leadsResult.page ?? 1,
      totalPages: leadsResult.totalPages ?? 1,
      totalDocs: leadsResult.totalDocs ?? 0,
      hasPrevPage: leadsResult.hasPrevPage ?? false,
      hasNextPage: leadsResult.hasNextPage ?? false,
    },
    totals: { leads: pipelineCounts.reduce((sum, r) => sum + r.totalDocs, 0), clients: clientsCount.totalDocs },
  }
}

export interface CrmRecordDetail {
  type: CrmView
  lead?: Lead
  client?: Client
  activities: Activity[]
}

/**
 * Ficha 360 de un lead o cliente con su timeline reciente, todo dentro del tenant.
 */
export async function getCrmRecord({
  payload,
  user,
  tenantId,
  type,
  id,
}: {
  payload: Payload
  user: User
  tenantId: number
  type: CrmView
  id: number
}): Promise<CrmRecordDetail | null> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  if (type === 'leads') {
    const result = await query({
      collection: 'leads',
      depth: 1,
      limit: 1,
      where: tenantWhere(tenantId, [{ id: { equals: id } }]),
    })
    const lead = result.docs[0] as Lead | undefined
    if (!lead) return null

    const activities = await query({
      collection: 'activities',
      depth: 1,
      limit: 25,
      sort: '-occurredAt',
      where: tenantWhere(tenantId, [{ lead: { equals: id } }]),
    })

    return { type: 'leads', lead, activities: activities.docs as Activity[] }
  }

  const result = await query({
    collection: 'clients',
    depth: 1,
    limit: 1,
    where: tenantWhere(tenantId, [{ id: { equals: id } }]),
  })
  const client = result.docs[0] as Client | undefined
  if (!client) return null

  const activities = await query({
    collection: 'activities',
    depth: 1,
    limit: 25,
    sort: '-occurredAt',
    where: tenantWhere(tenantId, [{ client: { equals: id } }]),
  })

  return { type: 'clientes', client, activities: activities.docs as Activity[] }
}
