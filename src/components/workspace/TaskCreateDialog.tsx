'use client'

import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'

import { createTaskAction } from '@/lib/tasks-actions'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/tasks-filters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Client, Lead, User } from '@/payload-types'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const statusBadgeCls: Record<TaskStatus, string> = {
  pendiente: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  en_progreso: 'border-sky-800 bg-sky-950/50 text-sky-300',
  bloqueada: 'border-amber-800 bg-amber-950/50 text-amber-300',
  completada: 'border-emerald-800 bg-emerald-950/50 text-emerald-300',
  cancelada: 'border-zinc-800 bg-zinc-950 text-zinc-500',
}

const priorityLabel: Record<TaskPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

const priorityCls: Record<TaskPriority, string> = {
  baja: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
  media: 'bg-zinc-800 text-zinc-200 border border-zinc-600',
  alta: 'bg-amber-900/50 text-amber-300 border border-amber-800',
  urgente: 'bg-red-900/50 text-red-400 border border-red-800',
}

const labelCls = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

/* Textarea nativa (no hay ui/textarea en el proyecto) con los mismos tokens que `Input`. */
const textareaCls =
  'flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

interface TaskCreateDialogProps {
  assignees: User[]
  clients: Client[]
  leads: Lead[]
  variant?: 'primary' | 'secondary' | 'ghost'
  redirectTo?: string
  defaultClientId?: number
  defaultLeadId?: number
  defaultStatus?: TaskStatus
}

export function TaskCreateDialog({
  assignees,
  clients,
  leads,
  variant = 'primary',
  redirectTo = '/workspace/tasks',
  defaultClientId,
  defaultLeadId,
  defaultStatus = 'pendiente',
}: TaskCreateDialogProps) {
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState<TaskPriority>('media')
  const [relationType, setRelationType] = useState<'none' | 'client' | 'lead'>(
    defaultClientId ? 'client' : defaultLeadId ? 'lead' : 'none',
  )
  const [crmSearch, setCrmSearch] = useState('')

  const triggerCls =
    variant === 'primary'
      ? 'bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300'
      : variant === 'ghost'
        ? 'gap-1 border-zinc-800 bg-zinc-900 px-2 font-mono text-[10px] font-normal text-zinc-400 hover:bg-zinc-900 hover:text-white'
        : 'gap-1.5 border-zinc-700 bg-zinc-900 px-3 font-mono text-xs font-bold uppercase text-zinc-200 hover:bg-zinc-800 hover:text-zinc-200'

  const filteredClients = crmSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(crmSearch.toLowerCase()))
    : clients

  const filteredLeads = crmSearch
    ? leads.filter((l) => l.fullName.toLowerCase().includes(crmSearch.toLowerCase()))
    : leads

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={variant === 'ghost' ? 'ghost' : variant === 'secondary' ? 'outline' : 'default'}
          className={triggerCls}
        >
          <Plus className={variant === 'ghost' ? 'size-3' : 'size-3.5'} />
          <span>Nueva Tarea</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Creación de Tarea · Ejecución Ágil</DialogTitle>
          <DialogDescription>
            Centro de Ejecución Ágil · Martes Hub — planifica la entrega, asigna responsables del
            equipo y vincula con cuentas CRM.
          </DialogDescription>
        </DialogHeader>
        <form action={createTaskAction} className="flex flex-col gap-4 font-mono text-xs">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="priority" value={priority} />

          {/* Título e Instrucciones */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className={labelCls}>
              Título de la tarea
            </Label>
            <Input
              id="task-title"
              name="title"
              required
              maxLength={180}
              placeholder="Ej. Enviar propuesta comercial o resolver ticket de onboarding"
              autoFocus
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description" className={labelCls}>
              Instrucciones / Contexto relevante (opcional)
            </Label>
            <textarea
              id="task-description"
              name="description"
              rows={3}
              maxLength={5000}
              placeholder="Detalles, criterios de aceptación o notas de ejecución..."
              className={textareaCls}
            />
          </div>

          {/* Estado y Prioridad Interactiva */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Columna / Estado Inicial</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {TASK_STATUSES.map((s) => {
                const isSelected = status === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-2 py-1.5 text-center text-[10px] font-mono border transition-all ${
                      isSelected
                        ? `${statusBadgeCls[s]} ring-1 ring-white/20 font-bold`
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {statusLabel[s]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>Nivel de Prioridad</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {TASK_PRIORITIES.map((p) => {
                const isSelected = priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-2 py-1.5 text-center text-xs font-mono font-medium border transition-all ${
                      isSelected
                        ? `${priorityCls[p]} ring-1 ring-white/20 font-bold`
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    {priorityLabel[p]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date" className={labelCls}>
                Fecha Límite
              </Label>
              <Input id="task-due-date" name="dueDate" type="date" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-assigned-to" className={labelCls}>
                Responsable
              </Label>
              <Select name="assignedTo">
                <SelectTrigger id="task-assigned-to" className="w-full font-mono text-xs">
                  <SelectValue placeholder="Sin asignar (Equipo)" />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vinculación CRM */}
          <fieldset className="flex flex-col gap-2.5">
            <legend className={labelCls}>Vinculación CRM (Opcional)</legend>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'none'}
                  onChange={() => setRelationType('none')}
                  className="accent-sky-500"
                />
                <span>Sin vínculo</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'client'}
                  onChange={() => setRelationType('client')}
                  className="accent-sky-500"
                />
                <span>Cliente</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'lead'}
                  onChange={() => setRelationType('lead')}
                  className="accent-sky-500"
                />
                <span>Lead / Prospecto</span>
              </label>
            </div>

            {relationType === 'client' && (
              <div className="space-y-1.5">
                <Input
                  type="text"
                  placeholder="Filtrar clientes por nombre..."
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  className="font-mono text-xs"
                />
                <Select
                  name="client"
                  defaultValue={defaultClientId ? String(defaultClientId) : undefined}
                >
                  <SelectTrigger className="w-full font-mono text-xs">
                    <SelectValue placeholder="Selecciona un cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredClients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} {c.companyName ? `(${c.companyName})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {relationType === 'lead' && (
              <div className="space-y-1.5">
                <Input
                  type="text"
                  placeholder="Filtrar prospectos por nombre..."
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  className="font-mono text-xs"
                />
                <Select
                  name="lead"
                  defaultValue={defaultLeadId ? String(defaultLeadId) : undefined}
                >
                  <SelectTrigger className="w-full font-mono text-xs">
                    <SelectValue placeholder="Selecciona un prospecto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredLeads.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.fullName} {l.companyName ? `(${l.companyName})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </fieldset>

          {/* Subtareas Iniciales */}
          <div className="space-y-1.5">
            <Label htmlFor="task-checklist" className={labelCls}>
              Checklist inicial de subtareas{' '}
              <small className="normal-case text-muted-foreground">(una por línea)</small>
            </Label>
            <textarea
              id="task-checklist"
              name="checklist"
              rows={3}
              placeholder="Subtarea 1: Revisar requisitos&#10;Subtarea 2: Preparar entregable&#10;Subtarea 3: Confirmación con cliente"
              className={textareaCls}
            />
          </div>

          {/* Footer de Acciones */}
          <div className="flex items-center gap-1 pt-1 text-[11px] font-mono text-muted-foreground">
            <Sparkles className="size-3 text-sky-400" />
            <span>Disponible al instante en el tablero</span>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="font-mono text-xs font-bold uppercase tracking-wider">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="bg-sky-400 font-mono text-xs font-black uppercase text-black shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300"
            >
              <Plus className="size-3.5" />
              <span>Crear Tarea</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
