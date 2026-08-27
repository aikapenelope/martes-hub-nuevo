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

async function assertRelation(collection: 'users' | 'clients' | 'leads', relationId: number | undefined, tenantId: number, context: Awaited<ReturnType<typeof getWorkspaceContext>>) {
  if (!relationId) return
  const where: Where = collection === 'users'
    ? { and: [{ id: { equals: relationId } }, { 'tenants.tenant': { equals: tenantId } }] }
    : { and: [{ id: { equals: relationId } }, { tenant: { equals: tenantId } }] }
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
  return { title: text(form, 'title', 180, true)!, description: text(form, 'description', 5000), status: rawStatus as TaskStatus, priority: rawPriority as TaskPriority, dueDate: text(form, 'dueDate', 40), assignedTo: id(form, 'assignedTo'), client: id(form, 'client'), lead: id(form, 'lead'), checklist }
}

export async function createTaskAction(form: FormData) {
  const context = await getWorkspaceContext(); assertEditor(context.canEdit)
  const data = taskData(form)
  await Promise.all([assertRelation('users', data.assignedTo, context.tenantId, context), assertRelation('clients', data.client, context.tenantId, context), assertRelation('leads', data.lead, context.tenantId, context)])
  const task = await context.payload.create({ collection: 'tasks', overrideAccess: false, user: context.user, data: { ...data, tenant: context.tenantId, source: 'manual' } })
  revalidatePath('/tasks'); revalidatePath('/overview'); redirect(`/tasks/${task.id}?created=1`)
}

export async function updateTaskAction(form: FormData) {
  const taskId = id(form, 'id'); if (!taskId) throw new Error('Identificador inválido')
  const { context, task } = await scopedTask(taskId); assertEditor(context.canEdit)
  const data = taskData(form)
  await Promise.all([assertRelation('users', data.assignedTo, context.tenantId, context), assertRelation('clients', data.client, context.tenantId, context), assertRelation('leads', data.lead, context.tenantId, context)])
  const existingDone = new Map((task.checklist ?? []).map((item) => [item.item, Boolean(item.done)]))
  await context.payload.update({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user, data: { ...data, checklist: data.checklist.map((item) => ({ ...item, done: existingDone.get(item.item) ?? false })) } })
  revalidatePath('/tasks'); revalidatePath('/overview'); revalidatePath(`/tasks/${taskId}`); redirect(`/tasks/${taskId}?updated=1`)
}

export async function changeTaskStatusAction(form: FormData) {
  const taskId = id(form, 'id'); const status = text(form, 'status', 30)
  if (!taskId || !TASK_STATUSES.includes(status as TaskStatus)) throw new Error('Cambio de estado inválido')
  const { context } = await scopedTask(taskId); assertEditor(context.canEdit)
  await context.payload.update({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user, data: { status: status as TaskStatus } })
  revalidatePath('/tasks'); revalidatePath('/overview'); revalidatePath(`/tasks/${taskId}`)
}

export async function toggleChecklistAction(form: FormData) {
  const taskId = id(form, 'id'); const index = Number(form.get('index'))
  if (!taskId || !Number.isInteger(index)) throw new Error('Subtarea inválida')
  const { context, task } = await scopedTask(taskId); assertEditor(context.canEdit)
  const checklist = (task.checklist ?? []).map((item, position) => position === index ? { item: item.item, done: !item.done } : { item: item.item, done: Boolean(item.done) })
  await context.payload.update({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user, data: { checklist } })
  revalidatePath('/tasks'); revalidatePath(`/tasks/${taskId}`)
}

export async function deleteTaskAction(form: FormData) {
  const taskId = id(form, 'id'); if (!taskId) throw new Error('Identificador inválido')
  const { context } = await scopedTask(taskId); if (!context.isAdmin) throw new Error('Solo admin puede eliminar tareas')
  await context.payload.delete({ collection: 'tasks', id: taskId, overrideAccess: false, user: context.user })
  revalidatePath('/tasks'); revalidatePath('/overview'); redirect('/tasks?deleted=1')
}
