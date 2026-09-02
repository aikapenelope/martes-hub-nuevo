/**
 * CrmPage — `/workspace/crm`. Pipeline de leads y cartera de clientes,
 * con la misma UI Storelink (fondo negro, mono, bordes zinc-800) del resto
 * del workspace.
 */

import 'server-only'


import { CrmPipelineWorkspace } from '@/components/workspace/CrmPipelineWorkspace'
import { getCrmData, parseCrmFilters, type CrmSearchParams } from '@/lib/crm-data'
import { getCrmPipelineData } from '@/lib/crm-pipeline-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Segment, User } from '@/payload-types'
import { CrmHeader } from '@/components/workspace/crm/CrmHeader'
import { CrmViewNavigation } from '@/components/workspace/crm/CrmViewNavigation'
import { CrmTableListView } from '@/components/workspace/crm/CrmTableListView'

interface CrmPageProps {
  searchParams: Promise<CrmSearchParams>
}

export default async function CrmPage({ searchParams }: CrmPageProps) {
  const params = await searchParams
  const filters = parseCrmFilters(params)
  const context = await getWorkspaceContext()
  const data = await getCrmData({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    filters,
  })

  const showPipeline = filters.view === 'leads' && filters.mode === 'pipeline'

  const [agentsResult, segmentsResult] = showPipeline
    ? await Promise.all([
        context.payload.find({
          collection: 'users',
          where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
          limit: 100,
          depth: 0,
          overrideAccess: false,
          user: context.user,
        }),
        context.payload.find({
          collection: 'segments',
          where: { tenant: { equals: context.tenantId } },
          limit: 200,
          depth: 0,
          overrideAccess: false,
          user: context.user,
        }),
      ])
    : [{ docs: [] as User[] }, { docs: [] as Segment[] }]

  const agents = agentsResult.docs as User[]
  const segmentsList = segmentsResult.docs as Segment[]
  const pipelineColumns = showPipeline
    ? await getCrmPipelineData({ payload: context.payload, user: context.user, tenantId: context.tenantId })
    : []

  return (
    <>
      <CrmHeader tenant={context.tenant} view={data.view} canEdit={context.canEdit} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Leads abiertos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.totals.leads}</p>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Clientes activos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.totals.clients}</p>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Empresas registradas</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white font-mono">{data.totals.companies}</p>
        </div>
      </section>

      <CrmViewNavigation filters={filters} view={data.view} />

      {showPipeline ? (
        <CrmPipelineWorkspace columns={pipelineColumns} canEdit={context.canEdit} assignees={agents} segments={segmentsList} />
      ) : (
        <CrmTableListView data={data} filters={filters} />
      )}
    </>
  )
}
