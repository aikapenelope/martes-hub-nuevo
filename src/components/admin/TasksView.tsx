/**
 * TasksView — Payload custom admin view registrada en `/admin/tasks`.
 *
 * Puerto de la antigua página `(workspace)/tasks/page.tsx`. `searchParams` se
 * acepta como objeto plano u opcional (Payload) o como Promise (App Router).
 */

import 'server-only'

import { getTasksData, parseTaskFilters, type TaskSearchParams } from '@/lib/tasks-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { TasksWorkspace } from '@/components/admin/TasksWorkspace'

interface TasksViewProps {
  searchParams?: TaskSearchParams | Promise<TaskSearchParams>
}

export async function TasksView({ searchParams }: TasksViewProps = {}) {
  const [params, context] = await Promise.all([
    Promise.resolve(searchParams).then((value) => value ?? {}),
    getWorkspaceContext(),
  ])
  const filters = parseTaskFilters(params)
  const data = await getTasksData({ payload: context.payload, user: context.user, tenantId: context.tenantId, filters })
  return <TasksWorkspace data={data} filters={filters} canEdit={context.canEdit} />
}
