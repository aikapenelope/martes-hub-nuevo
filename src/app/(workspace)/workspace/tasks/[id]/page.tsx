/**
 * TaskDetailPage — `/workspace/tasks/[id]`. Ficha de una tarea: edición,
 * checklist interactivo, relación CRM y borrado (solo admin).
 */

import Link from 'next/link'
import { ArrowLeft, CalendarDays, Check, CircleUserRound, Link2, Trash2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { Client, Lead, User } from '@/payload-types'
import { getTaskDetail, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/tasks-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { deleteTaskAction, toggleChecklistAction, updateTaskAction } from '@/lib/tasks-actions'

const labels = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada', baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' }
const relId = (value: number | { id: number } | null | undefined) => typeof value === 'number' ? value : value?.id
const person = (user: number | User | null | undefined) => user && typeof user === 'object' ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : 'Sin asignar'

const inputCls = 'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; updated?: string }> }) {
  const [{ id }, notice, context] = await Promise.all([params, searchParams, getWorkspaceContext()])
  const taskId = Number(id)
  if (!Number.isInteger(taskId)) notFound()
  const [task, assignees, clients, leads] = await Promise.all([
    getTaskDetail({ payload: context.payload, user: context.user, tenantId: context.tenantId, id: taskId }),
    context.payload.find({ collection: 'users', limit: 100, overrideAccess: false, user: context.user, where: { 'tenants.tenant': { equals: context.tenantId } } }),
    context.payload.find({ collection: 'clients', limit: 100, overrideAccess: false, user: context.user, where: { tenant: { equals: context.tenantId } } }),
    context.payload.find({ collection: 'leads', limit: 100, overrideAccess: false, user: context.user, where: { tenant: { equals: context.tenantId } } }),
  ])
  if (!task) notFound()

  return (
    <>
      <Link href="/workspace/tasks" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-mono">
        <ArrowLeft size={16} />Volver a tareas
      </Link>

      {(notice.created || notice.updated) && (
        <div className="flex items-center gap-2 border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300">
          <Check size={16} />{notice.created ? 'Tarea creada correctamente.' : 'Cambios guardados.'}
        </div>
      )}

      <header className="flex flex-col justify-between gap-4 border border-zinc-800 bg-zinc-950 p-5 sm:flex-row sm:items-center">
        <div>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700`}>{labels[task.priority]}</span>
          <h1 className="mt-2 text-xl font-bold text-white">{task.title}</h1>
          <p className="mt-1 text-xs text-zinc-400">Tarea #{task.id} · Actualizada {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(task.updatedAt))}</p>
        </div>
        {context.isAdmin && (
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5">
              <Trash2 size={14} />Eliminar
            </button>
          </form>
        )}
      </header>

      {!context.canEdit && (
        <div className="flex items-center gap-2 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
          <CircleUserRound size={18} />
          <div><strong className="text-white">Vista de solo lectura</strong> — puedes revisar todos los detalles de esta tarea.</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <section className="border border-zinc-800 bg-zinc-950 p-5">
          {context.canEdit ? (
            <form action={updateTaskAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={task.id} />
              <label className={labelCls}>Título<input name="title" defaultValue={task.title} required className={inputCls} /></label>
              <label className={labelCls}>Descripción<textarea name="description" rows={5} defaultValue={task.description ?? ''} className={inputCls} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Estado
                  <select name="status" defaultValue={task.status} className={inputCls}>
                    {TASK_STATUSES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
                  </select>
                </label>
                <label className={labelCls}>
                  Prioridad
                  <select name="priority" defaultValue={task.priority} className={inputCls}>
                    {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Fecha límite<input name="dueDate" type="date" defaultValue={task.dueDate?.slice(0, 10) ?? ''} className={inputCls} /></label>
                <label className={labelCls}>
                  Responsable
                  <select name="assignedTo" defaultValue={relId(task.assignedTo)} className={inputCls}>
                    <option value="">Sin asignar</option>
                    {assignees.docs.map((item) => { const user = item as User; return <option key={user.id} value={user.id}>{person(user)}</option> })}
                  </select>
                </label>
                <label className={labelCls}>
                  Cliente
                  <select name="client" defaultValue={relId(task.client)} className={inputCls}>
                    <option value="">Ninguno</option>
                    {clients.docs.map((item) => { const client = item as Client; return <option key={client.id} value={client.id}>{client.name}</option> })}
                  </select>
                </label>
                <label className={labelCls}>
                  Lead
                  <select name="lead" defaultValue={relId(task.lead)} className={inputCls}>
                    <option value="">Ninguno</option>
                    {leads.docs.map((item) => { const lead = item as Lead; return <option key={lead.id} value={lead.id}>{lead.fullName}</option> })}
                  </select>
                </label>
              </div>
              <label className={labelCls}>Checklist <small className="text-zinc-500">(una subtarea por línea)</small><textarea name="checklist" rows={5} defaultValue={(task.checklist ?? []).map((item) => item.item).join('\n')} className={inputCls} /></label>
              <button type="submit" className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Guardar cambios</button>
            </form>
          ) : (
            <div>
              <h2 className="text-base font-bold text-white">Descripción</h2>
              <p className="mt-2 text-sm text-zinc-300">{task.description || 'Sin descripción.'}</p>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="text-base font-bold text-white">Contexto</h2>
            <dl className="mt-3 flex flex-col gap-3 text-xs">
              <div><dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><CalendarDays size={14} />Vencimiento</dt><dd className="mt-1 text-white">{task.dueDate ? new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(task.dueDate)) : 'Sin fecha'}</dd></div>
              <div><dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><CircleUserRound size={14} />Responsable</dt><dd className="mt-1 text-white">{person(task.assignedTo)}</dd></div>
              <div>
                <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><Link2 size={14} />Relación CRM</dt>
                <dd className="mt-1 text-white">
                  {task.client && typeof task.client === 'object' ? (
                    <Link href={`/workspace/crm/clientes/${task.client.id}`} className="hover:underline">{task.client.name}</Link>
                  ) : task.lead && typeof task.lead === 'object' ? (
                    <Link href={`/workspace/crm/leads/${task.lead.id}`} className="hover:underline">{task.lead.fullName}</Link>
                  ) : 'Sin relación'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="text-base font-bold text-white">Checklist</h2>
            {task.checklist?.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {task.checklist.map((item, index) => (
                  <form action={toggleChecklistAction} key={item.id ?? item.item}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="index" value={index} />
                    <button
                      type="submit"
                      disabled={!context.canEdit}
                      data-done={Boolean(item.done)}
                      className="flex w-full items-center gap-2 border border-zinc-800 px-3 py-2 text-left text-xs text-zinc-300 data-[done=true]:border-emerald-800 data-[done=true]:text-emerald-300 disabled:cursor-not-allowed"
                    >
                      <span className="flex h-4 w-4 items-center justify-center border border-zinc-700">{item.done ? <Check size={12} /> : null}</span>
                      {item.item}
                    </button>
                  </form>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Sin subtareas.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
