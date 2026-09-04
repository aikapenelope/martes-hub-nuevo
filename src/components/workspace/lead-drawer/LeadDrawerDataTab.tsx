'use client'

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, Loader2, UserCheck } from 'lucide-react'
import { convertLeadInSituAction, updateLeadFieldsAction } from '@/lib/crm-pipeline-actions'
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
 *
 * Además, los campos de texto que no cambiaron respecto al lead se omiten:
 * guardar un campo ajeno nunca re-envía (y trunca) notas largas existentes.
 */
export function collectLeadFieldsInput(
  form: FormData,
  lead: Lead,
  opts: { hasAssigneeChoices: boolean; hasSegmentChoices: boolean },
): Parameters<typeof updateLeadFieldsAction>[1] {
  const segmentRaw = form.get('segment')
  const assignedToRaw = form.get('assignedTo')

  // Omitir el campo si el valor enviado es idéntico al ya guardado
  const ifChanged = (formKey: string, current: string | null | undefined, capped: string | undefined) => {
    const submitted = String(form.get(formKey) ?? '')
    return submitted === (current ?? '') ? undefined : capped
  }

  return {
    fullName: String(form.get('fullName') ?? ''),
    companyName: ifChanged('companyName', lead.companyName, capText(String(form.get('companyName') ?? ''), 200)),
    position: ifChanged('position', lead.position, capText(String(form.get('position') ?? ''), 120)),
    phone: ifChanged('phone', lead.phone, capText(String(form.get('phone') ?? ''), 40)),
    email: ifChanged('email', lead.email, capText(String(form.get('email') ?? ''), 320)),
    city: ifChanged('city', lead.city, capText(String(form.get('city') ?? ''), 120)),
    address: ifChanged('address', lead.address, capText(String(form.get('address') ?? ''), 300)),
    googleMapsUrl: ifChanged('googleMapsUrl', lead.googleMapsUrl, capText(String(form.get('googleMapsUrl') ?? ''), 500)),
    socialHandle: ifChanged('socialHandle', lead.socialHandle, capText(String(form.get('socialHandle') ?? ''), 120)),
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
    commercialNotes: ifChanged(
      'commercialNotes',
      lead.commercialNotes,
      capText(String(form.get('commercialNotes') ?? ''), 20000),
    ),
    notes: ifChanged('notes', lead.notes, capText(String(form.get('notes') ?? ''), 20000)),
  }
}

/** Recorta texto acotado; vacío → undefined (omitir). */
function capText(value: string, max: number): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
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
  const [converting, setConverting] = useState(false)
  const [justConvertedId, setJustConvertedId] = useState<number | null>(null)
  const convertedId = relId(lead.convertedClient) ?? justConvertedId
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const segmentId = relId(lead.segment)
  const assignedToId = relId(lead.assignedTo)

  // Opciones efectivas: si la relación actual del lead no está entre las
  // opciones provistas (agente inactivo filtrado de la lista, límite de
  // paginación), se sintetiza una opción con su valor real. Sin esto el
  // select caería a "Sin asignar"/"Sin rubro" y guardar borraría la relación.
  const segmentOptions = useMemo<Segment[]>(() => {
    if (segmentId == null || segments.some((s) => s.id === segmentId)) return segments
    const current = lead.segment
    const label =
      typeof current === 'object' && current && 'name' in current && current.name
        ? current.name
        : `Rubro #${segmentId}`
    return [...segments, { id: segmentId, name: label } as Segment]
  }, [segments, segmentId, lead.segment])

  const assigneeOptions = useMemo<User[]>(() => {
    if (assignedToId == null || assignees.some((a) => a.id === assignedToId)) return assignees
    const current = lead.assignedTo
    let label = `Agente #${assignedToId}`
    if (typeof current === 'object' && current) {
      const name = [current.firstName, current.lastName].filter(Boolean).join(' ')
      label = name || current.email || label
    }
    return [...assignees, { id: assignedToId, email: label } as User]
  }, [assignees, assignedToId, lead.assignedTo])

  async function handleConvert(): Promise<void> {
    if (!canEdit || converting) return
    setConverting(true)
    setError(null)
    setFeedback(null)
    const result = await convertLeadInSituAction(lead.id)
    setConverting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setJustConvertedId(result.clientId)
    setFeedback(`¡Prospecto convertido exitosamente a Cliente #${result.clientId}!`)
    onSaved?.()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    setFeedback(null)
    const form = new FormData(event.currentTarget)
    const result = await updateLeadFieldsAction(
      lead.id,
      collectLeadFieldsInput(form, lead, {
        hasAssigneeChoices: assigneeOptions.length > 0,
        hasSegmentChoices: segmentOptions.length > 0,
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
      <fieldset disabled={!canEdit || saving || converting} className="flex flex-col gap-3">
        {/* Banner de Estado / Conversión a Cliente */}
        <div className="border border-zinc-800 bg-zinc-950 p-3">
          {convertedId ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                <span>
                  Este prospecto está convertido a <strong>Cliente #{convertedId}</strong>.
                </span>
              </div>
              <Link
                href={`/workspace/crm/clientes/${convertedId}`}
                className="inline-flex items-center gap-1 border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900/60 transition"
              >
                <ExternalLink size={12} /> Ver Ficha de Cliente
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">Conversión Comercial</span>
                <span className="text-[11px] text-zinc-400">
                  Crea la cuenta oficial de cliente heredando datos, notas y timeline in-situ.
                </span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  disabled={converting || saving}
                  onClick={() => void handleConvert()}
                  className="inline-flex items-center gap-1.5 border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {converting ? (
                    <Loader2 size={13} className="animate-spin text-black" />
                  ) : (
                    <UserCheck size={13} />
                  )}
                  Convertir a Cliente
                </button>
              )}
            </div>
          )}
        </div>

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
              {segmentOptions.map((segment) => (
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
            {assigneeOptions.map((agent) => (
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
