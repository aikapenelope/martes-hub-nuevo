'use client'

import { useState, type FormEvent } from 'react'
import { updateLeadFieldsAction } from '@/lib/crm-pipeline-actions'
import type { Lead, Segment, User } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 font-sans'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

/**
 * Construye el payload del formulario a partir del FormData.
 *
 * Regla crítica: si el caller no proveyó opciones para `segment` o
 * `assignedTo` (p. ej. el drawer del cockpit), esos campos se OMITEN
 * (`undefined` → el update no los toca). El select sin opciones renderiza la
 * opción vacía aunque el lead tenga relación previa, y enviarla borraría la
 * asignación/rubro existente. Con opciones presentes, la elección explícita
 * del usuario (incluida "Sin asignar") sí se envía.
 */
export function collectLeadFieldsInput(
  form: FormData,
  opts: { hasAssigneeChoices: boolean; hasSegmentChoices: boolean },
): Parameters<typeof updateLeadFieldsAction>[1] {
  const segmentRaw = form.get('segment')
  const assignedToRaw = form.get('assignedTo')
  return {
    fullName: String(form.get('fullName') ?? ''),
    companyName: String(form.get('companyName') ?? ''),
    position: String(form.get('position') ?? ''),
    phone: String(form.get('phone') ?? ''),
    email: String(form.get('email') ?? ''),
    city: String(form.get('city') ?? ''),
    address: String(form.get('address') ?? ''),
    googleMapsUrl: String(form.get('googleMapsUrl') ?? ''),
    socialHandle: String(form.get('socialHandle') ?? ''),
    source: form.get('source') as
      | 'manual'
      | 'google_maps'
      | 'puerta_fria'
      | 'whatsapp'
      | 'instagram_dm'
      | 'linkedin'
      | 'tally'
      | 'apify'
      | 'referido',
    segment: opts.hasSegmentChoices
      ? segmentRaw
        ? Number(segmentRaw)
        : null
      : undefined,
    estimatedValue: form.get('estimatedValue') ? Number(form.get('estimatedValue')) : null,
    assignedTo: opts.hasAssigneeChoices
      ? assignedToRaw
        ? Number(assignedToRaw)
        : null
      : undefined,
    commercialNotes: String(form.get('commercialNotes') ?? ''),
    notes: String(form.get('notes') ?? ''),
  }
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
    const result = await updateLeadFieldsAction(
      lead.id,
      collectLeadFieldsInput(form, {
        hasAssigneeChoices: assignees.length > 0,
        hasSegmentChoices: segments.length > 0,
      }),
    )
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setFeedback('Cambios comerciales guardados.')
    onSaved?.()
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3 pb-6">
      <fieldset disabled={!canEdit || saving} className="flex flex-col gap-3">
        {/* Identidad y Empresa */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Nombre de Contacto
            <input name="fullName" defaultValue={lead.fullName} maxLength={160} required className={inputCls} />
          </label>
          <label className={labelCls}>
            Empresa / Negocio
            <input name="companyName" defaultValue={lead.companyName ?? ''} placeholder="Ej: Restaurant La Terraza" className={inputCls} />
          </label>
        </div>

        {/* Origen y Canal */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Canal de Origen
            <select name="source" defaultValue={lead.source ?? 'manual'} className={inputCls}>
              <option value="manual">Manual</option>
              <option value="google_maps">Google Maps / Local</option>
              <option value="puerta_fria">Puerta Fría / En Persona</option>
              <option value="whatsapp">WhatsApp Directo</option>
              <option value="instagram_dm">Instagram DM</option>
              <option value="linkedin">LinkedIn</option>
              <option value="tally">Formulario Web / Tally</option>
              <option value="apify">Apify Scraper</option>
              <option value="referido">Referido</option>
            </select>
          </label>
          <label className={labelCls}>
            Cargo / Rol
            <input name="position" defaultValue={lead.position ?? ''} placeholder="Ej: Gerente General" className={inputCls} />
          </label>
        </div>

        {/* Contacto */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Teléfono (WhatsApp)
            <input name="phone" defaultValue={lead.phone ?? ''} placeholder="58412..." className={inputCls} />
          </label>
          <label className={labelCls}>
            Email
            <input name="email" type="email" defaultValue={lead.email ?? ''} className={inputCls} />
          </label>
        </div>

        {/* Ubicación y Enlaces */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Ciudad
            <input name="city" defaultValue={lead.city ?? ''} placeholder="Ej: Caracas" className={inputCls} />
          </label>
          <label className={labelCls}>
            Red Social (IG / LinkedIn)
            <input name="socialHandle" defaultValue={lead.socialHandle ?? ''} placeholder="@usuario" className={inputCls} />
          </label>
        </div>

        <label className={labelCls}>
          Enlace Google Maps
          <input name="googleMapsUrl" defaultValue={lead.googleMapsUrl ?? ''} placeholder="https://maps.google.com/..." className={inputCls} />
        </label>

        {/* Segmento y Oportunidad */}
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
          Comentarios Comerciales (WhatsApp / Presencial)
          <textarea
            name="commercialNotes"
            rows={3}
            defaultValue={lead.commercialNotes ?? ''}
            placeholder="Feedback directo, objeciones expresadas, acuerdos verbales de reuniones..."
            className={inputCls}
          />
        </label>

        <label className={labelCls}>
          Notas internas generales
          <textarea name="notes" rows={2} defaultValue={lead.notes ?? ''} className={inputCls} />
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
            className="mt-2 self-start border border-white bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        )}
      </fieldset>
    </form>
  )
}
