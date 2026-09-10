/**
 * TaskDetailPage — `/workspace/tasks/[id]`. Ficha de una tarea: edición,
 * checklist interactivo, relación CRM y borrado (solo admin).
 */

import Link from 'next/link'
import { ArrowLeft, CalendarDays, Check, CircleUserRound, Link2, Trash2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { Client, Lead, User } from '@/payload-types'
import { getAssignableUsers, getTaskDetail, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/tasks-data'
import { formatTaskDueDate } from '@/lib/tasks-filters'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { deleteTaskAction, toggleChecklistAction, updateTaskAction } from '@/lib/tasks-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const labels = { pendiente: 'Pendiente', en_progreso: 'En progreso', bloqueada: 'Bloqueada', completada: 'Completada', cancelada: 'Cancelada', baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' }
const relId = (value: number | { id: number } | null | undefined) => typeof value === 'number' ? value : value?.id
const person = (user: number | User | null | undefined) => user && typeof user === 'object' ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : 'Sin asignar'

const fieldCls = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
/* Textarea nativa (no hay ui/textarea en el proyecto), mismos tokens que `Input`. */
const textareaCls = 'flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
const labelCls = 'flex flex-col gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground'

export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; updated?: string }> }) {
  const [{ id }, notice, context] = await Promise.all([params, searchParams, getWorkspaceContext()])
  const taskId = Number(id)
  if (!Number.isInteger(taskId)) notFound()
  const [task, assignees, clients, leads] = await Promise.all([
    getTaskDetail({ payload: context.payload, user: context.user, tenantId: context.tenantId, id: taskId }),
    getAssignableUsers({ payload: context.payload, user: context.user, tenantId: context.tenantId }),
    context.payload.find({ collection: 'clients', limit: 100, overrideAccess: false, user: context.user, where: { tenant: { equals: context.tenantId } } }),
    context.payload.find({ collection: 'leads', limit: 100, overrideAccess: false, user: context.user, where: { tenant: { equals: context.tenantId } } }),
  ])
  if (!task) notFound()

  // Preservar el responsable actual si está inactivo o fuera de la consulta activa,
  // respetando estrictamente el aislamiento multitenant con overrideAccess: false.
  const currentAssigneeId =
    typeof task.assignedTo === 'object' && task.assignedTo
      ? task.assignedTo.id
      : typeof task.assignedTo === 'number'
      ? task.assignedTo
      : null

  const currentAssigneeUser = currentAssigneeId
    ? ((await context.payload.findByID({
        collection: 'users',
        id: currentAssigneeId,
        overrideAccess: false,
        user: context.user,
      }).catch(() => null)) as User | null)
    : null

  const isCurrentInAssignees =
    currentAssigneeUser && assignees.some((u) => u.id === currentAssigneeUser.id)

  const assigneeOptions: User[] =
    currentAssigneeUser && !isCurrentInAssignees
      ? [currentAssigneeUser, ...assignees]
      : assignees

  const currentClient =
    task.client && typeof task.client === 'object' ? (task.client as Client) : null
  const isCurrentInClients =
    currentClient && clients.docs.some((c) => c.id === currentClient.id)
  const clientOptions: Client[] =
    currentClient && !isCurrentInClients
      ? [currentClient, ...(clients.docs as Client[])]
      : (clients.docs as Client[])

  const currentLead =
    task.lead && typeof task.lead === 'object' ? (task.lead as Lead) : null
  const isCurrentInLeads =
    currentLead && leads.docs.some((l) => l.id === currentLead.id)
  const leadOptions: Lead[] =
    currentLead && !isCurrentInLeads
      ? [currentLead, ...(leads.docs as Lead[])]
      : (leads.docs as Lead[])

  return (
    <>
      <Link href="/workspace/tasks" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} />Volver a tareas
      </Link>

      {(notice.created || notice.updated) && (
        <div className="flex items-center gap-2 border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300">
          <Check size={16} />{notice.created ? 'Tarea creada correctamente.' : 'Cambios guardados.'}
        </div>
      )}

      <header className="flex flex-col justify-between gap-4 border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center">
        <div>
          <span className="border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">{labels[task.priority]}</span>
          <h1 className="mt-2 text-xl font-bold text-foreground">{task.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Tarea #{task.id} · Actualizada {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(task.updatedAt))}</p>
        </div>
        {context.isAdmin && (
          <form action={deleteTaskAction}>
            <input type="hidden" name="id" value={task.id} />
            <Button
              type="submit"
              className="gap-1.5 border-red-800 bg-red-950 px-3 font-mono text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-900"
            >
              <Trash2 className="size-3.5" />Eliminar
            </Button>
          </form>
        )}
      </header>

      {!context.canEdit && (
        <div className="flex items-center gap-2 border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <CircleUserRound size={18} />
          <div><strong className="text-foreground">Vista de solo lectura</strong> — puedes revisar todos los detalles de esta tarea.</div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <section className="border border-border bg-card p-5 text-card-foreground">
          {context.canEdit ? (
            <form action={updateTaskAction} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={task.id} />
              <label className={labelCls}>Título<Input name="title" defaultValue={task.title} required className="text-sm" /></label>
              <label className={labelCls}>Descripción<textarea name="description" rows={5} defaultValue={task.description ?? ''} className={textareaCls} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Estado
                  <select name="status" defaultValue={task.status} className={fieldCls}>
                    {TASK_STATUSES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
                  </select>
                </label>
                <label className={labelCls}>
                  Prioridad
                  <select name="priority" defaultValue={task.priority} className={fieldCls}>
                    {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
                  </select>
                </label>
                <label className={labelCls}>Fecha límite<Input name="dueDate" type="date" defaultValue={task.dueDate?.slice(0, 10) ?? ''} className="text-sm" /></label>
                <label className={labelCls}>
                  Responsable
                  <select name="assignedTo" defaultValue={relId(task.assignedTo)} className={fieldCls}>
                    <option value="">Sin asignar</option>
                    {currentAssigneeId && !currentAssigneeUser && (
                      <option value={currentAssigneeId}>
                        Responsable asignado (restringido)
                      </option>
                    )}
                    {assigneeOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {person(user)}{user.active === false ? ' (inactivo)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Cliente
                  <select name="client" defaultValue={relId(task.client)} className={fieldCls}>
                    <option value="">Ninguno</option>
                    {clientOptions.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Lead
                  <select name="lead" defaultValue={relId(task.lead)} className={fieldCls}>
                    <option value="">Ninguno</option>
                    {leadOptions.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.fullName}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={labelCls}>Checklist <small className="text-muted-foreground">(una subtarea por línea)</small><textarea name="checklist" rows={5} defaultValue={(task.checklist ?? []).map((item) => item.item).join('\n')} className={textareaCls} /></label>
              <Button type="submit" className="self-start bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground">Guardar cambios</Button>
            </form>
          ) : (
            <div>
              <h2 className="text-base font-bold text-foreground">Descripción</h2>
              <p className="mt-2 text-sm text-foreground">{task.description || 'Sin descripción.'}</p>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="border border-border bg-card p-5 text-card-foreground">
            <h2 className="text-base font-bold text-foreground">Contexto</h2>
            <dl className="mt-3 flex flex-col gap-3 text-xs">
              <div><dt className="flex items-center gap-1.5 font-mono uppercase text-muted-foreground"><CalendarDays size={14} />Vencimiento</dt><dd className="mt-1 text-foreground">{formatTaskDueDate(task.dueDate, { dateStyle: 'long' })}</dd></div>
              <div><dt className="flex items-center gap-1.5 font-mono uppercase text-muted-foreground"><CircleUserRound size={14} />Responsable</dt><dd className="mt-1 text-foreground">{person(task.assignedTo)}</dd></div>
              <div>
                <dt className="flex items-center gap-1.5 font-mono uppercase text-muted-foreground"><Link2 size={14} />Relación CRM</dt>
                <dd className="mt-1 text-foreground">
                  {task.client && typeof task.client === 'object' ? (
                    <Link href={`/workspace/crm/clientes/${task.client.id}`} className="hover:underline">{task.client.name}</Link>
                  ) : task.lead && typeof task.lead === 'object' ? (
                    <Link href={`/workspace/crm/leads/${task.lead.id}`} className="hover:underline">{task.lead.fullName}</Link>
                  ) : 'Sin relación'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="border border-border bg-card p-5 text-card-foreground">
            <h2 className="text-base font-bold text-foreground">Checklist</h2>
            {task.checklist?.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {task.checklist.map((item, index) => (
                  <form action={toggleChecklistAction} key={item.id ?? item.item}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="index" value={index} />
                    <Button
                      type="submit"
                      disabled={!context.canEdit}
                      data-done={Boolean(item.done)}
                      className="flex w-full items-center gap-2 rounded-none border-border px-3 py-2 text-left text-xs font-medium text-foreground data-[done=true]:border-emerald-800 data-[done=true]:text-emerald-300 disabled:cursor-not-allowed"
                    >
                      <span className="flex h-4 w-4 items-center justify-center border border-border">{item.done ? <Check className="size-3" /> : null}</span>
                      {item.item}
                    </Button>
                  </form>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Sin subtareas.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
