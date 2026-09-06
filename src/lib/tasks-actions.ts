'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Task } from '@/payload-types'
import type { Where } from 'payload'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/tasks-filters'
import { getWorkspaceContext } from '@/lib/workspace-context'

const text = (form: FormData, key: string, max: number, required = false) => {
  const value = form.get(key)
  const normalized = typeof value === 'string' ? value.trim().slice(0, max) : ''
  if (required && !normalized) throw new Error(`El campo ${key} es obligatorio`)
  return normalized || undefined
}
const id = (form: FormData, key: string) => { const value = Number(form.get(key)); return Number.isInteger(value) && value > 0 ? value : undefined }
const assertEditor = (canEdit: boolean) => { if (!canEdit) throw new Error('No tienes permiso para modificar tareas') }

function safeInternalRedirectUrl(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return fallback
}

async function assertRelation(
  collection: 'users' | 'clients' | 'leads',
  relationId: number | null | undefined,
  tenantId: number,
  context: Awaited<ReturnType<typeof getWorkspaceContext>>,
) {
  if (!relationId) return
  if (collection === 'users') {
    const userDoc = await context.payload.findByID({
      collection: 'users',
      id: relationId,
      overrideAccess: false,
      user: context.user,
    })
    if (!userDoc) {
      throw new Error('El usuario asignado no existe')
    }
    if (userDoc.active === false) {
      throw new Error('El usuario asignado está inactivo')
    }
    const isTargetAdmin = userDoc.roles?.includes('admin')
    const hasTenant = (userDoc.tenants || []).some((t) => {
      const tId = typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant
      return tId === tenantId
    })
    if (!isTargetAdmin && !hasTenant) {
      throw new Error('El usuario asignado no pertenece al tenant activo')
    }
    return
  }
  const where: Where = { and: [{ id: { equals: relationId } }, { tenant: { equals: tenantId } }] }
  const result = await context.payload.find({ collection, limit: 1, overrideAccess: false, user: context.user, where })
  if (!result.docs[0]) throw new Error('La relación seleccionada no pertenece al tenant activo')
}

async function scopedTask(taskId: number) {
  const context = await getWorkspaceContext()
  const result = await context.payload.find({ collection: 'tasks', limit: 1, overrideAccess: false, user: context.user, where: { and: [{ id: { equals: taskId } }, { tenant: { equals: context.tenantId } }] } })
  const task = result.docs[0] as Task | undefined
  if (!task) throw new Error('Tarea no encontrada en el tenant activo')
  return { context, task }
}

function taskData(form: FormData) {
  const rawStatus = text(form, 'status', 30) ?? 'pendiente'
  const rawPriority = text(form, 'priority', 30) ?? 'media'
  if (!TASK_STATUSES.includes(rawStatus as TaskStatus) || !TASK_PRIORITIES.includes(rawPriority as TaskPriority)) throw new Error('Estado o prioridad inválidos')
  const checklist = (text(form, 'checklist', 4000) ?? '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 30).map((item) => ({ item, done: false }))
  const rawDue = text(form, 'dueDate', 40)
  return {
    title: text(form, 'title', 180, true)!,
    description: text(form, 'description', 5000) ?? null,
    status: rawStatus as TaskStatus,
    priority: rawPriority as TaskPriority,
    dueDate: rawDue ? new Date(rawDue).toISOString() : null,
    assignedTo: id(form, 'assignedTo') ?? null,
    client: id(form, 'client') ?? null,
    lead: id(form, 'lead') ?? null,
    checklist,
  }
}

export async function createTaskAction(form: FormData) {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)
  const data = taskData(form)
  await Promise.all([
    assertRelation('users', data.assignedTo, context.tenantId, context),
    assertRelation('clients', data.client, context.tenantId, context),
    assertRelation('leads', data.lead, context.tenantId, context),
  ])
  const task = await context.payload.create({
    collection: 'tasks',
    overrideAccess: false,
    user: context.user,
    data: { ...data, tenant: context.tenantId, source: 'manual' },
  })
  revalidatePath('/workspace/tasks')
  revalidatePath('/workspace')
  revalidatePath('/workspace/hoy')
  revalidatePath('/workspace/crm')
  const rawRedirect = text(form, 'redirectTo', 200)
  const redirectTo = safeInternalRedirectUrl(rawRedirect, `/workspace/tasks/${task.id}?created=1`)
  redirect(redirectTo)
}

export async function updateTaskAction(form: FormData) {
  const taskId = id(form, 'id'); if (!taskId) throw new Error('Identificador inválido')
  const { context, task } = await scopedTask(taskId); assertEditor(context.canEdit)
  const data = taskData(form)
  const currentAssignedId = typeof task.assignedTo === 'object' ? task.assignedTo?.id : task.assignedTo
  const isKeepingAssignee = Boolean(data.assignedTo && currentAssignedId && data.assignedTo === currentAssignedId)

  await Promise.all([
    ...(isKeepingAssignee ? [] : [assertRelation('users', data.assignedTo, context.tenantId, context)]),
    assertRelation('clients', data.client, context.tenantId, context),
    assertRelation('leads', data.lead, context.tenantId, context),
  ])
  const assignedTo = isKeepingAssignee ? currentAssignedId : data.assignedTo
  const existingDone = new Map((task.checklist ?? []).map((item) => [item.item, Boolean(item.done)]))
  await context.payload.update({
    collection: 'tasks',
    id: taskId,
    overrideAccess: false,
    user: context.user,
    data: {
      ...data,
      assignedTo,
      checklist: data.checklist.map((item) => ({ ...item, done: existingDone.get(item.item) ?? false })),
    },
  })
  revalidatePath('/workspace/tasks'); revalidatePath('/workspace'); revalidatePath('/workspace/hoy'); revalidatePath('/workspace/crm'); revalidatePath(`/workspace/tasks/${taskId}`); redirect(`/workspace/tasks/${taskId}?updated=1`)
}

export async function updateTaskStatusAction(
  taskId: number,
  newStatus: TaskStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!TASK_STATUSES.includes(newStatus)) throw new Error('Estado de tarea inválido')
    const { context } = await scopedTask(taskId)
    assertEditor(context.canEdit)
    await context.payload.update({
      collection: 'tasks',
      id: taskId,
      overrideAccess: false,
      user: context.user,
      data: { status: newStatus },
    })
    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace')
    revalidatePath('/workspace/hoy')
    revalidatePath('/workspace/crm')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error actualizando tarea' }
  }
}

export async function changeTaskStatusAction(form: FormData) {
  const taskId = id(form, 'id'); const status = text(form, 'status', 30)
  if (!taskId || !TASK_STATUSES.includes(status as TaskStatus)) throw new Error('Cambio de estado inválido')
  const { context } = await scopedTask(taskId); assertEditor(context.canEdit)
  await context.payload.update({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user, data: { status: status as TaskStatus } })
  revalidatePath('/workspace/tasks'); revalidatePath('/workspace'); revalidatePath('/workspace/hoy'); revalidatePath('/workspace/crm'); revalidatePath(`/workspace/tasks/${taskId}`)
}

export async function toggleChecklistAction(form: FormData) {
  const taskId = id(form, 'id'); const index = Number(form.get('index'))
  if (!taskId || !Number.isInteger(index)) throw new Error('Subtarea inválida')
  const { context, task } = await scopedTask(taskId); assertEditor(context.canEdit)
  const checklist = (task.checklist ?? []).map((item, position) => position === index ? { item: item.item, done: !item.done } : { item: item.item, done: Boolean(item.done) })
  await context.payload.update({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user, data: { checklist } })
  revalidatePath('/workspace/tasks'); revalidatePath('/workspace/hoy'); revalidatePath(`/workspace/tasks/${taskId}`)
}

export async function deleteTaskAction(form: FormData) {
  const taskId = id(form, 'id'); if (!taskId) throw new Error('Identificador inválido')
  const { context } = await scopedTask(taskId); if (!context.isAdmin) throw new Error('Solo admin puede eliminar tareas')
  await context.payload.delete({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user })
  revalidatePath('/workspace/tasks'); revalidatePath('/workspace'); revalidatePath('/workspace/hoy'); revalidatePath('/workspace/crm'); redirect('/workspace/tasks?deleted=1')
}

/**
 * Creación in-situ rápida (estilo Linear) sin recargar la página ni navegar.
 * Ideal para el atajo al fondo de cada columna Kanban.
 */
export async function createTaskInSituAction(params: {
  title: string
  status: TaskStatus
  priority?: TaskPriority
  dueDate?: string | null
  assignedTo?: number | null
}): Promise<{ ok: true; task: Task } | { ok: false; error: string }> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const title = params.title.trim().slice(0, 180)
    if (!title) throw new Error('El título de la tarea es obligatorio')

    const status: TaskStatus = TASK_STATUSES.includes(params.status) ? params.status : 'pendiente'
    const priority: TaskPriority =
      params.priority && TASK_PRIORITIES.includes(params.priority) ? params.priority : 'media'

    if (params.assignedTo) {
      await assertRelation('users', params.assignedTo, context.tenantId, context)
    }

    const task = (await context.payload.create({
      collection: 'tasks',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        title,
        status,
        priority,
        dueDate: params.dueDate ? new Date(params.dueDate).toISOString() : null,
        assignedTo: params.assignedTo ?? null,
        source: 'manual',
        checklist: [],
      },
    })) as Task

    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace')
    revalidatePath('/workspace/hoy')
    revalidatePath('/workspace/crm')

    return { ok: true, task }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al crear la tarea' }
  }
}

/**
 * Actualización in-situ de campos de tarea sin redirecciones (usado por el Slide-Over Drawer).
 */
export async function updateTaskInSituAction(params: {
  taskId: number
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string | null
  assignedTo?: number | null
}): Promise<{ ok: true; task: Task } | { ok: false; error: string }> {
  try {
    const { context } = await scopedTask(params.taskId)
    assertEditor(context.canEdit)

    const data: Record<string, unknown> = {}
    if (params.title !== undefined) {
      const trimmed = params.title.trim().slice(0, 180)
      if (!trimmed) throw new Error('El título no puede estar vacío')
      data.title = trimmed
    }
    if (params.description !== undefined) {
      data.description = params.description ? params.description.trim().slice(0, 5000) : null
    }
    if (params.status && TASK_STATUSES.includes(params.status)) {
      data.status = params.status
    }
    if (params.priority && TASK_PRIORITIES.includes(params.priority)) {
      data.priority = params.priority
    }
    if (params.dueDate !== undefined) {
      data.dueDate = params.dueDate ? new Date(params.dueDate).toISOString() : null
    }
    if (params.assignedTo !== undefined) {
      if (params.assignedTo) {
        await assertRelation('users', params.assignedTo, context.tenantId, context)
      }
      data.assignedTo = params.assignedTo
    }

    const updated = (await context.payload.update({
      collection: 'tasks',
      id: params.taskId,
      overrideAccess: false,
      user: context.user,
      data,
    })) as Task

    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace')
    revalidatePath('/workspace/hoy')
    revalidatePath('/workspace/crm')
    revalidatePath(`/workspace/tasks/${params.taskId}`)

    return { ok: true, task: updated }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar la tarea' }
  }
}

/**
 * Toggle in-situ de una subtarea del checklist sin recarga.
 */
export async function toggleChecklistInSituAction(params: {
  taskId: number
  index: number
}): Promise<{ ok: true; checklist: Task['checklist'] } | { ok: false; error: string }> {
  try {
    const { context, task } = await scopedTask(params.taskId)
    assertEditor(context.canEdit)

    if (!Number.isInteger(params.index) || params.index < 0) {
      throw new Error('Índice de subtarea inválido')
    }

    const checklist = (task.checklist ?? []).map((item, position) =>
      position === params.index ? { item: item.item, done: !item.done } : { item: item.item, done: Boolean(item.done) },
    )

    const updated = (await context.payload.update({
      collection: 'tasks',
      id: params.taskId,
      overrideAccess: false,
      user: context.user,
      data: { checklist },
    })) as Task

    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace/hoy')
    revalidatePath(`/workspace/tasks/${params.taskId}`)

    return { ok: true, checklist: updated.checklist }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar subtarea' }
  }
}

/**
 * Añadir subtarea in-situ sin recarga de página.
 */
export async function addChecklistItemInSituAction(params: {
  taskId: number
  item: string
}): Promise<{ ok: true; checklist: Task['checklist'] } | { ok: false; error: string }> {
  try {
    const { context, task } = await scopedTask(params.taskId)
    assertEditor(context.canEdit)

    const itemText = params.item.trim().slice(0, 180)
    if (!itemText) throw new Error('El texto de la subtarea es obligatorio')

    const currentChecklist = task.checklist ?? []
    if (currentChecklist.length >= 30) throw new Error('Máximo 30 subtareas por tarea')

    const checklist = [...currentChecklist, { item: itemText, done: false }]
    const updated = (await context.payload.update({
      collection: 'tasks',
      id: params.taskId,
      overrideAccess: false,
      user: context.user,
      data: { checklist },
    })) as Task

    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace/hoy')
    revalidatePath(`/workspace/tasks/${params.taskId}`)

    return { ok: true, checklist: updated.checklist }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al añadir subtarea' }
  }
}

