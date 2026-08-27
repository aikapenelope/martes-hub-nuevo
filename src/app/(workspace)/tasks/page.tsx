import { getTasksData, parseTaskFilters, type TaskSearchParams } from '@/lib/tasks-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { TasksWorkspace } from './components/TasksWorkspace'

export default async function TasksPage({ searchParams }: { searchParams: Promise<TaskSearchParams> }) {
  const [params, context] = await Promise.all([searchParams, getWorkspaceContext()])
  const filters = parseTaskFilters(params)
  const data = await getTasksData({ payload: context.payload, user: context.user, tenantId: context.tenantId, filters })
  return <TasksWorkspace data={data} filters={filters} canEdit={context.canEdit}/>
}
