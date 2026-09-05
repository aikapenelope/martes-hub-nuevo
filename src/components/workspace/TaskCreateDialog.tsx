'use client'

import { useRef, useState } from 'react'
import { CheckSquare, Plus, X } from 'lucide-react'

import { createTaskAction } from '@/lib/tasks-actions'
import type { Client, Lead, User } from '@/payload-types'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/lib/tasks-filters'

const statusLabel: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const priorityLabel: Record<TaskPriority, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
}

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 font-mono'
const labelCls = 'flex flex-col gap-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400'

interface TaskCreateDialogProps {
  assignees: User[]
  clients: Client[]
  leads: Lead[]
  variant?: 'primary' | 'secondary'
  redirectTo?: string
  defaultClientId?: number
  defaultLeadId?: number
}

export function TaskCreateDialog({
  assignees,
  clients,
  leads,
  variant = 'primary',
  redirectTo = '/workspace/tasks',
  defaultClientId,
  defaultLeadId,
}: TaskCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [relationType, setRelationType] = useState<'none' | 'client' | 'lead'>(
    defaultClientId ? 'client' : defaultLeadId ? 'lead' : 'none',
  )
  const [crmSearch, setCrmSearch] = useState('')

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-white hover:bg-zinc-200 text-black font-black flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider transition shadow-[0_0_16px_rgba(255,255,255,0.15)]'
      : 'px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-1.5 text-xs font-mono uppercase transition'

  const filteredClients = crmSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(crmSearch.toLowerCase()))
    : clients

  const filteredLeads = crmSearch
    ? leads.filter((l) => l.fullName.toLowerCase().includes(crmSearch.toLowerCase()))
    : leads

  return (
    <>
      <button
        type="button"
        className={btnCls}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus size={14} />
        <span>Nueva Tarea</span>
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(36rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white shadow-2xl font-mono"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3.5 bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-sky-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Crear Nueva Tarea
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => dialogRef.current?.close()}
            className="text-zinc-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <form action={createTaskAction} className="flex flex-col gap-3.5 p-5 text-xs">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <label className={labelCls}>
            Título de la tarea
            <input
              name="title"
              required
              maxLength={180}
              placeholder="Ej. Enviar propuesta comercial o agendar demo"
              className={inputCls}
              autoFocus
            />
          </label>

          <label className={labelCls}>
            Descripción / Instrucciones (opcional)
            <textarea
              name="description"
              rows={2}
              maxLength={5000}
              placeholder="Detalles, requerimientos o contexto relevante..."
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={labelCls}>
              Prioridad
              <select name="priority" defaultValue="media" className={inputCls}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel[p]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelCls}>
              Estado Inicial
              <select name="status" defaultValue="pendiente" className={inputCls}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelCls}>
              Fecha Límite
              <input name="dueDate" type="date" className={inputCls} />
            </label>

            <label className={labelCls}>
              Responsable
              <select name="assignedTo" defaultValue="" className={inputCls}>
                <option value="">Sin asignar</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Relación CRM */}
          <div className="p-3 bg-zinc-900/40 border border-zinc-800 space-y-2">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              Vinculación CRM (Opcional)
            </span>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'none'}
                  onChange={() => setRelationType('none')}
                />
                <span className="text-zinc-300">Ninguna</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'client'}
                  onChange={() => setRelationType('client')}
                />
                <span className="text-zinc-300">Cliente</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="relTypeRadio"
                  checked={relationType === 'lead'}
                  onChange={() => setRelationType('lead')}
                />
                <span className="text-zinc-300">Lead</span>
              </label>
            </div>

            {relationType === 'client' && (
              <div className="space-y-1 pt-1">
                <input
                  type="text"
                  placeholder="Filtrar clientes..."
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  className="w-full bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white focus:outline-none mb-1"
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
              <div className="space-y-1 pt-1">
                <input
                  type="text"
                  placeholder="Filtrar prospectos..."
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  className="w-full bg-black border border-zinc-800 px-2 py-1 text-[11px] text-white focus:outline-none mb-1"
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

          <label className={labelCls}>
            Checklist de subtareas <small className="text-zinc-500 normal-case">(una por línea)</small>
            <textarea
              name="checklist"
              rows={3}
              placeholder="Subtarea 1&#10;Subtarea 2&#10;Subtarea 3"
              className={inputCls}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-900">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
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
        </form>
      </dialog>
    </>
  )
}
