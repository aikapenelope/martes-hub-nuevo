'use client'

import { useState, type FormEvent } from 'react'
import { updateLeadFieldsAction } from '@/lib/crm-pipeline-actions'
import type { Lead, Segment, User } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

export function LeadDrawerDataTab({
  lead,
  canEdit,
  assignees,
  segments,
  onSaved,
}: {
  lead: Lead
  canEdit: boolean
  assignees: User[]
  segments: Segment[]
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const segmentId = relId(lead.segment)
  const assignedToId = relId(lead.assignedTo)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    const form = new FormData(event.currentTarget)
    const result = await updateLeadFieldsAction(lead.id, {
      fullName: String(form.get('fullName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      segment: form.get('segment') ? Number(form.get('segment')) : null,
      estimatedValue: form.get('estimatedValue') ? Number(form.get('estimatedValue')) : null,
      assignedTo: form.get('assignedTo') ? Number(form.get('assignedTo')) : null,
      notes: String(form.get('notes') ?? ''),
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFeedback('Cambios guardados.')
    onSaved?.()
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
      <fieldset disabled={!canEdit || saving} className="flex flex-col gap-3">
        <label className={labelCls}>
          Nombre
          <input name="fullName" defaultValue={lead.fullName} maxLength={160} required className={inputCls} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Teléfono
            <input name="phone" defaultValue={lead.phone ?? ''} className={inputCls} />
          </label>
          <label className={labelCls}>
            Email
            <input name="email" type="email" defaultValue={lead.email ?? ''} className={inputCls} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Rubro
            <select name="segment" defaultValue={segmentId ?? ''} className={inputCls}>
              <option value="">Sin rubro</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Valor estimado (USD)
            <input name="estimatedValue" type="number" min={0} defaultValue={lead.estimatedValue ?? ''} className={inputCls} />
          </label>
        </div>
        <label className={labelCls}>
          Agente asignado
          <select name="assignedTo" defaultValue={assignedToId ?? ''} className={inputCls}>
            <option value="">Sin asignar</option>
            {assignees.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {[agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.email}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Notas internas
          <textarea name="notes" rows={4} defaultValue={lead.notes ?? ''} className={inputCls} />
        </label>

        {error && (
          <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
            {error}
          </div>
        )}
        {feedback && (
          <div className="border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300" role="status">
            {feedback}
          </div>
        )}
        {canEdit && (
          <button
            type="submit"
            disabled={saving}
            className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </fieldset>
    </form>
  )
}
