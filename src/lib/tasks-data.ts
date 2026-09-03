import 'server-only'

import type { Payload, Where } from 'payload'
import type { Client, Lead, Task, User } from '@/payload-types'
import { TASK_STATUSES, type TaskFilters, type TaskStatus } from '@/lib/tasks-filters'

export { TASK_PRIORITIES, TASK_STATUSES, TASK_VIEWS, checklistProgress, dueState, parseTaskFilters } from '@/lib/tasks-filters'
export type { DueFilter, TaskFilters, TaskPriority, TaskSearchParams, TaskStatus, TaskView } from '@/lib/tasks-filters'

const PAGE_SIZE = 30
const day = (date: Date) => date.toISOString().slice(0, 10)
const tenantWhere = (tenantId: number, extra: Where[] = []): Where => ({ and: [{ tenant: { equals: tenantId } }, ...extra] })

export interface TasksData {
  tasks: Task[]
  columns: { status: TaskStatus; total: number; tasks: Task[] }[]
  metrics: { pending: number; inProgress: number; overdue: number; completedWeek: number }
  assignees: User[]
  clients: Client[]
  leads: Lead[]
  pagination: { page: number; totalPages: number; totalDocs: number; hasPrevPage: boolean; hasNextPage: boolean }
}

export async function getTasksData({ payload, user, tenantId, filters }: { payload: Payload; user: User; tenantId: number; filters: TaskFilters }): Promise<TasksData> {
  const query = <T extends Parameters<typeof payload.find>[0]>(options: T) => payload.find({ ...options, overrideAccess: false, user } as T)
  const now = new Date()
  const today = day(now)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6)
  const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7)
  const extra: Where[] = []
  if (filters.query) extra.push({ or: [{ title: { like: filters.query } }, { description: { like: filters.query } }] })
  if (filters.status !== 'todos') extra.push({ status: { equals: filters.status } })
  if (filters.priority !== 'todas') extra.push({ priority: { equals: filters.priority } })
  if (filters.assignee !== 'todos') extra.push({ assignedTo: { equals: filters.assignee } })
  if (filters.due === 'vencidas') extra.push({ and: [{ dueDate: { less_than: today } }, { status: { not_in: ['completada', 'cancelada'] } }] })
  if (filters.due === 'hoy') extra.push({ dueDate: { equals: today } })
  if (filters.due === 'semana') extra.push({ and: [{ dueDate: { greater_than_equal: today } }, { dueDate: { less_than_equal: day(weekEnd) } }] })
  if (filters.due === 'sin_fecha') extra.push({ dueDate: { exists: false } })

  const [result, pending, inProgress, overdue, completedWeek, assignees, clients, leads, ...counts] = await Promise.all([
    query({ collection: 'tasks', depth: 1, limit: filters.view === 'tablero' ? 100 : PAGE_SIZE, page: filters.page, sort: 'dueDate', where: tenantWhere(tenantId, extra) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, [{ status: { equals: 'pendiente' } }]) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, [{ status: { equals: 'en_progreso' } }]) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, [{ dueDate: { less_than: today } }, { status: { not_in: ['completada', 'cancelada'] } }]) }),
    query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, [{ status: { equals: 'completada' } }, { completedAt: { greater_than_equal: weekStart.toISOString() } }]) }),
    getAssignableUsers({ payload, user, tenantId }),
    query({ collection: 'clients', depth: 0, limit: 100, sort: 'name', where: tenantWhere(tenantId), select: { name: true } }),
    query({ collection: 'leads', depth: 0, limit: 100, sort: 'fullName', where: tenantWhere(tenantId), select: { fullName: true } }),
    ...TASK_STATUSES.map((status) => query({ collection: 'tasks', limit: 0, where: tenantWhere(tenantId, [...extra.filter((item) => !('status' in item)), { status: { equals: status } }]) })),
  ])
  const tasks = result.docs as Task[]
  return {
    tasks,
    columns: TASK_STATUSES.map((status, index) => ({ status, total: counts[index].totalDocs, tasks: tasks.filter((task) => task.status === status) })),
    metrics: { pending: pending.totalDocs, inProgress: inProgress.totalDocs, overdue: overdue.totalDocs, completedWeek: completedWeek.totalDocs },
    assignees, clients: clients.docs as Client[], leads: leads.docs as Lead[],
    pagination: { page: result.page ?? 1, totalPages: result.totalPages ?? 1, totalDocs: result.totalDocs, hasPrevPage: result.hasPrevPage ?? false, hasNextPage: result.hasNextPage ?? false },
  }
}

export async function getAssignableUsers({
  payload,
  user,
  tenantId,
}: {
  payload: Payload
  user: User
  tenantId: number
}): Promise<User[]> {
  const result = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 100,
    sort: 'firstName',
    overrideAccess: false,
    user,
    where: {
      and: [
        { active: { not_equals: false } },
        {
          or: [
            { 'tenants.tenant': { equals: tenantId } },
            { roles: { contains: 'admin' } },
          ],
        },
      ],
    },
    select: { firstName: true, lastName: true, email: true, roles: true, active: true },
  })
  return result.docs as User[]
}

export async function getTaskDetail({ payload, user, tenantId, id }: { payload: Payload; user: User; tenantId: number; id: number }) {
  const result = await payload.find({ collection: 'tasks', depth: 1, limit: 1, overrideAccess: false, user, where: tenantWhere(tenantId, [{ id: { equals: id } }]) })
  return result.docs[0] as Task | undefined
}
