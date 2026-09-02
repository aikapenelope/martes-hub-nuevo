/**
 * CrmRecordPage — `/workspace/crm/[type]/[id]`. Ficha 360 de un lead o
 * cliente: datos de contacto, edición, timeline de actividades y conversión
 * lead→cliente, con la misma UI Storelink del resto del workspace.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleDot, Mail, MessageCircle, Phone, Plus, UserRound } from 'lucide-react'

import { convertLeadAction, createActivityAction, updateClientAction, updateLeadAction } from '@/lib/crm-actions'
import { getCrmRecord, type CrmView } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Segment, User } from '@/payload-types'

function relationName(value: number | Segment | User | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && value.name) return value.name
  if ('email' in value && value.email) return value.email
  return 'Sin asignar'
}

const inputCls = 'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

export default async function CrmRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>
  searchParams: Promise<{ created?: string; updated?: string; converted?: string }>
}) {
  const { type: rawType, id: rawId } = await params
  const feedback = await searchParams
  if (rawType !== 'leads' && rawType !== 'clientes') notFound()
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const type = rawType as CrmView
  const context = await getWorkspaceContext()
  const detail = await getCrmRecord({ payload: context.payload, user: context.user, tenantId: context.tenantId, type, id })
  if (!detail) notFound()

  const isLead = type === 'leads'
  const record = isLead ? detail.lead! : detail.client!
  const name = isLead && 'fullName' in record ? record.fullName : 'name' in record ? record.name : ''
  const email = record.email
  const phone = record.phone
  const convertedId = isLead && detail.lead?.convertedClient
    ? typeof detail.lead.convertedClient === 'number' ? detail.lead.convertedClient : detail.lead.convertedClient.id
    : undefined

  return (
    <>
      <Link href={`/workspace/crm?vista=${type}`} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-mono">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver al CRM
      </Link>

      {(feedback.created || feedback.updated || feedback.converted) && (
        <div className="flex items-center gap-2 border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300" role="status">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          {feedback.created ? 'Registro creado correctamente.' : feedback.updated ? 'Cambios guardados.' : 'Lead convertido a cliente.'}
        </div>
      )}

      <header className="flex flex-col justify-between gap-4 oled-card p-5 sm:flex-row sm:items-center bracket-accent">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center border border-zinc-700 bg-zinc-900 text-white"><UserRound className="w-5 h-5" aria-hidden="true" /></span>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">{isLead ? 'Lead' : 'Cliente'} · #{record.id}</div>
            <h1 className="text-xl font-bold text-white">{name}</h1>
            <p className="text-xs text-zinc-400">{relationName(record.segment)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.conversations.length > 0 && (
            <Link className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono" href={`/workspace/inbox?c=${detail.conversations[0].id}`}>
              Abrir en inbox
            </Link>
          )}
          {phone && (
            <a className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5" href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp
            </a>
          )}
          <Link className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono" href={`/workspace/tasks?${isLead ? 'lead' : 'client'}=${record.id}`}>Crear tarea</Link>
          {convertedId && <Link className="px-3 py-1.5 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono" href={`/workspace/crm/clientes/${convertedId}`}>Ver cliente</Link>}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <section className="oled-card p-5">
          <h2 className="text-base font-bold text-white">Ficha 360</h2>
          <p className="mt-1 text-xs text-zinc-400">Datos de contacto, estado y contexto interno.</p>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
            <div><dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email</dt><dd className="mt-1 text-white">{email ? <a href={`mailto:${email}`}>{email}</a> : 'Sin email'}</dd></div>
            <div><dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><Phone className="w-3.5 h-3.5" aria-hidden="true" /> Teléfono</dt><dd className="mt-1 text-white">{phone ? <a href={`tel:${phone}`}>{phone}</a> : 'Sin teléfono'}</dd></div>
            <div><dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase"><CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Estado</dt><dd className="mt-1 text-white">{isLead ? detail.lead!.status : detail.client!.stage}</dd></div>
            {!isLead && <div><dt className="text-zinc-500 font-mono uppercase">Agente</dt><dd className="mt-1 text-white">{relationName(detail.client!.assignedAgent)}</dd></div>}
          </dl>

          {context.canEdit ? (
            <form action={isLead ? updateLeadAction : updateClientAction} className="mt-5 flex flex-col gap-3">
              <input name="id" type="hidden" value={record.id} />
              <label className={labelCls}>Nombre<input name={isLead ? 'fullName' : 'name'} defaultValue={name} maxLength={160} required className={inputCls} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>Email<input name="email" type="email" defaultValue={email ?? ''} maxLength={240} className={inputCls} /></label>
                <label className={labelCls}>Teléfono<input name="phone" type="tel" defaultValue={phone ?? ''} maxLength={80} className={inputCls} /></label>
              </div>
              <label className={labelCls}>
                {isLead ? 'Estado' : 'Etapa'}
                {isLead ? (
                  <select name="status" defaultValue={detail.lead!.status} className={inputCls}>
                    <option value="nuevo">Nuevo</option><option value="contactado">Contactado</option><option value="calificado">Calificado</option><option value="descartado">Descartado</option>
                  </select>
                ) : (
                  <select name="stage" defaultValue={detail.client!.stage} className={inputCls}>
                    <option value="nuevo">Nuevo</option><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="perdido">Perdido</option>
                  </select>
                )}
              </label>
              {!isLead && (
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input name="consent" type="checkbox" defaultChecked={Boolean(detail.client!.consent)} /> Consentimiento de contacto
                </label>
              )}
              <label className={labelCls}>Notas internas<textarea name="notes" rows={4} maxLength={4000} defaultValue={record.notes ?? ''} className={inputCls} /></label>
              <button type="submit" className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Guardar cambios</button>
            </form>
          ) : (
            <div className="mt-5 border border-zinc-800 bg-black p-3 text-xs text-zinc-300">
              <strong className="text-white">Notas internas</strong>
              <p className="mt-1">{record.notes || 'Sin notas registradas.'}</p>
            </div>
          )}
        </section>

        <aside className="oled-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Timeline unificado</h2>
              <p className="text-xs text-zinc-400">Conversaciones, emails, citas, tareas, cobros y actividades.</p>
            </div>
          </div>

          {detail.timeline.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500">Todavía no hay actividad para este registro.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3 border-l border-zinc-800 pl-4">
              {detail.timeline.map((entry, index) => (
                <li key={`${entry.kind}-${index}-${entry.date}`} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${
                      entry.direction === 'in' ? 'bg-emerald-400' : entry.direction === 'out' ? 'bg-sky-400' : 'bg-white'
                    }`}
                    aria-hidden="true"
                  />
                  {entry.href ? (
                    <Link href={entry.href} className="block text-xs text-white hover:underline">
                      {entry.title}
                    </Link>
                  ) : (
                    <strong className="block text-xs text-white">{entry.title}</strong>
                  )}
                  {entry.detail && <span className="block text-[11px] text-zinc-400">{entry.detail}</span>}
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {entry.kind} · {new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.date))}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {context.canEdit && (
            <details className="mt-4 border border-zinc-800 bg-black">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs text-zinc-300 font-mono uppercase">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Registrar actividad
              </summary>
              <form action={createActivityAction} className="flex flex-col gap-3 p-3">
                {isLead
                  ? <input type="hidden" name="lead" value={record.id} />
                  : <input type="hidden" name="client" value={record.id} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    Tipo
                    <select name="type" defaultValue="nota" className={inputCls}>
                      <option value="nota">Nota</option>
                      <option value="llamada">Llamada</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="reunion">Reunión</option>
                      <option value="otro">Otro</option>
                    </select>
                  </label>
                  <label className={labelCls}>Fecha y hora<input type="datetime-local" name="occurredAt" className={inputCls} /></label>
                </div>
                <label className={labelCls}>
                  Resumen
                  <textarea name="summary" rows={3} maxLength={500} placeholder="¿Qué ocurrió? Ej: Llamada de 15 min, acordamos enviar propuesta" required className={inputCls} />
                </label>
                <button type="submit" className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Guardar actividad</button>
              </form>
            </details>
          )}

          {isLead && context.canEdit && !convertedId && (
            <form action={convertLeadAction} className="mt-4 border border-zinc-800 bg-black p-3">
              <input name="id" type="hidden" value={record.id} />
              <strong className="block text-xs text-white">¿La oportunidad avanzó?</strong>
              <p className="mt-1 text-xs text-zinc-400">Crea un cliente con estos datos y conserva el vínculo con el lead.</p>
              <button type="submit" className="mt-2 px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">Convertir a cliente</button>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
