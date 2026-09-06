'use client'

import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'

import { Drawer } from '@/components/workspace/overlays'
import { createTaskAction } from '@/lib/tasks-actions'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/tasks-filters'
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

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition font-mono'
const labelCls = 'flex flex-col gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400'

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
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<TaskStatus>(defaultStatus)
  const [priority, setPriority] = useState<TaskPriority>('media')
  const [relationType, setRelationType] = useState<'none' | 'client' | 'lead'>(
    defaultClientId ? 'client' : defaultLeadId ? 'lead' : 'none',
  )
  const [crmSearch, setCrmSearch] = useState('')

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-white hover:bg-zinc-200 text-black font-black flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider transition shadow-[0_0_16px_rgba(255,255,255,0.15)]'
      : variant === 'ghost'
        ? 'inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-white px-2 py-1 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 transition'
        : 'px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-1.5 text-xs font-mono uppercase transition'

  const filteredClients = crmSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(crmSearch.toLowerCase()))
    : clients

  const filteredLeads = crmSearch
    ? leads.filter((l) => l.fullName.toLowerCase().includes(crmSearch.toLowerCase()))
    : leads

  return (
    <>
      <button type="button" className={btnCls} onClick={() => setOpen(true)}>
        <Plus size={variant === 'ghost' ? 12 : 14} />
        <span>Nueva Tarea</span>
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title="Creación de Tarea · Ejecución Ágil"
      >
        <div className="flex flex-col gap-5 pb-6">
          {/* Subheader descriptivo */}
          <div className="border border-zinc-850 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span>Centro de Ejecución Ágil · Martes Hub</span>
            </div>
            <p className="mt-1 text-xs text-zinc-300">
              Planifica la entrega, asigna responsables del equipo y vincula con cuentas CRM.
            </p>
          </div>

          <form action={createTaskAction} className="flex flex-col gap-4 text-xs font-mono">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="priority" value={priority} />

            {/* Panel 1: Título e Instrucciones */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-3">
              <label className={labelCls}>
                Título de la tarea
                <input
                  name="title"
                  required
                  maxLength={180}
                  placeholder="Ej. Enviar propuesta comercial o resolver ticket de onboarding"
                  className={inputCls}
                  autoFocus
                />
              </label>

              <label className={labelCls}>
                Instrucciones / Contexto relevante (opcional)
                <textarea
                  name="description"
                  rows={3}
                  maxLength={5000}
                  placeholder="Detalles, criterios de aceptación o notas de ejecución..."
                  className={inputCls}
                />
              </label>
            </div>

            {/* Panel 2: Estado y Prioridad Interactiva */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Columna / Estado Inicial
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
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

              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Nivel de Prioridad
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className={labelCls}>
                  Fecha Límite
                  <input name="dueDate" type="date" className={inputCls} />
                </label>

                <label className={labelCls}>
                  Responsable
                  <select name="assignedTo" defaultValue="" className={inputCls}>
                    <option value="">Sin asignar (Equipo)</option>
                    {assignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Panel 3: Vinculación CRM */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                Vinculación CRM (Opcional)
              </span>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                  <input
                    type="radio"
                    name="relTypeRadio"
                    checked={relationType === 'none'}
                    onChange={() => setRelationType('none')}
                    className="accent-sky-500"
                  />
                  <span>Sin vínculo</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                  <input
                    type="radio"
                    name="relTypeRadio"
                    checked={relationType === 'client'}
                    onChange={() => setRelationType('client')}
                    className="accent-sky-500"
                  />
                  <span>Cliente</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
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
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Filtrar clientes por nombre..."
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    className="w-full bg-black border border-zinc-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                  <select
                    name="client"
                    defaultValue={defaultClientId ? String(defaultClientId) : ''}
                    className={inputCls}
                  >
                    <option value="">Selecciona un cliente...</option>
                    {filteredClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.companyName ? `(${c.companyName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {relationType === 'lead' && (
                <div className="space-y-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Filtrar prospectos por nombre..."
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    className="w-full bg-black border border-zinc-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                  <select
                    name="lead"
                    defaultValue={defaultLeadId ? String(defaultLeadId) : ''}
                    className={inputCls}
                  >
                    <option value="">Selecciona un prospecto...</option>
                    {filteredLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.fullName} {l.companyName ? `(${l.companyName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Panel 4: Subtareas Iniciales */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2">
              <label className={labelCls}>
                Checklist inicial de subtareas <small className="text-zinc-500 normal-case">(una por línea)</small>
                <textarea
                  name="checklist"
                  rows={3}
                  placeholder="Subtarea 1: Revisar requisitos&#10;Subtarea 2: Preparar entregable&#10;Subtarea 3: Confirmación con cliente"
                  className={inputCls}
                />
              </label>
            </div>

            {/* Footer de Acciones */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4 mt-2">
              <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                <Sparkles size={11} className="text-sky-400" />
                <span>Disponible al instante en el tablero</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black uppercase tracking-wider transition inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(255,255,255,0.2)]"
                >
                  <Plus size={14} />
                  <span>Crear Tarea</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </Drawer>
    </>
  )
}
