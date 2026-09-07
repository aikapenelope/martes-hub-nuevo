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

import { redirect } from 'next/navigation'

export default async function CrmPage({ searchParams }: CrmPageProps) {
  const params = await searchParams
  // Solo la visita "limpia" (sin ningún parámetro) aterriza en "mis" registros.
  // Una petición sin `agente` pero con otros filtros (búsqueda, limpiar, deep
  // link) respeta el default 'todos' de parseCrmFilters en vez de reescribir
  // la selección del usuario a 'me'.
  if (Object.keys(params).length === 0) {
    redirect('/workspace/crm?agente=me')
  }
  const filters = parseCrmFilters(params)
  const context = await getWorkspaceContext()
  const data = await getCrmData({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    filters,
  })

  const showPipeline = filters.view === 'leads' && filters.mode === 'pipeline'

  const [agentsResult, segmentsResult] = await Promise.all([
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

  const agents = agentsResult.docs as User[]
  const segmentsList = segmentsResult.docs as Segment[]
  const pipelineColumns = showPipeline
    ? await getCrmPipelineData({
        payload: context.payload,
        user: context.user,
        tenantId: context.tenantId,
        agent: filters.agent,
        currentUserId: context.user.id,
      })
    : []

  return (
    <>
      <CrmHeader tenant={context.tenant} view={data.view} canEdit={context.canEdit} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Leads abiertos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{data.totals.leads}</p>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Clientes activos</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{data.totals.clients}</p>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Empresas registradas</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{data.totals.companies}</p>
        </div>
      </section>

      <CrmViewNavigation filters={filters} view={data.view} agents={agents} currentUser={context.user} />

      {showPipeline ? (
        <CrmPipelineWorkspace columns={pipelineColumns} canEdit={context.canEdit} assignees={agents} segments={segmentsList} />
      ) : (
        <CrmTableListView data={data} filters={filters} />
      )}
    </>
  )
}
