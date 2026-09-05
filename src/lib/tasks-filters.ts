export const TASK_STATUSES = ['pendiente', 'en_progreso', 'bloqueada', 'completada', 'cancelada'] as const
export const TASK_PRIORITIES = ['baja', 'media', 'alta', 'urgente'] as const
export const TASK_VIEWS = ['tablero', 'lista'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskView = (typeof TASK_VIEWS)[number]
export type DueFilter = 'todos' | 'vencidas' | 'hoy' | 'semana' | 'sin_fecha'

export interface TaskSearchParams {
  vista?: string | string[]
  q?: string | string[]
  estado?: string | string[]
  prioridad?: string | string[]
  responsable?: string | string[]
  vencimiento?: string | string[]
  page?: string | string[]
  client?: string | string[]
  lead?: string | string[]
}

export interface TaskFilters {
  view: TaskView
  query: string
  status: TaskStatus | 'todos'
  priority: TaskPriority | 'todas'
  assignee: number | 'todos'
  due: DueFilter
  page: number
  clientId?: number
  leadId?: number
}

const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value

export function parseTaskFilters(params: TaskSearchParams): TaskFilters {
  const viewValue = first(params.vista)
  const statusValue = first(params.estado)
  const priorityValue = first(params.prioridad)
  const dueValue = first(params.vencimiento)
  const pageValue = Number(first(params.page))
  const assigneeValue = Number(first(params.responsable))
  const clientValue = Number(first(params.client))
  const leadValue = Number(first(params.lead))

  const filters: TaskFilters = {
    view: TASK_VIEWS.includes(viewValue as TaskView) ? (viewValue as TaskView) : 'tablero',
    query: (first(params.q) ?? '').trim().slice(0, 120),
    status: TASK_STATUSES.includes(statusValue as TaskStatus) ? (statusValue as TaskStatus) : 'todos',
    priority: TASK_PRIORITIES.includes(priorityValue as TaskPriority) ? (priorityValue as TaskPriority) : 'todas',
    assignee: Number.isInteger(assigneeValue) && assigneeValue > 0 ? assigneeValue : 'todos',
    due: ['vencidas', 'hoy', 'semana', 'sin_fecha'].includes(dueValue ?? '') ? (dueValue as DueFilter) : 'todos',
    page: Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10000) : 1,
  }

  if (Number.isInteger(clientValue) && clientValue > 0) filters.clientId = clientValue
  if (Number.isInteger(leadValue) && leadValue > 0) filters.leadId = leadValue

  return filters
}

export function checklistProgress(checklist: { done?: boolean | null }[] | null | undefined) {
  const total = checklist?.length ?? 0
  const done = checklist?.filter((item) => item.done).length ?? 0
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

export function dueState(dueDate: string | null | undefined, now = new Date()): 'none' | 'overdue' | 'today' | 'upcoming' {
  if (!dueDate) return 'none'
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate)
  let target: Date
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2]) - 1
    const day = Number(dateOnlyMatch[3])
    target = new Date(year, month, day)
  } else {
    const due = new Date(dueDate)
    target = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (target.getTime() < today.getTime()) return 'overdue'
  if (target.getTime() === today.getTime()) return 'today'
  return 'upcoming'
}
