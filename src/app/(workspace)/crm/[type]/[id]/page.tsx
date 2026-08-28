import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleDot, ExternalLink, Mail, MessageCircle, Phone, Plus, UserRound } from 'lucide-react'

import { convertLeadAction, createActivityAction, updateClientAction, updateLeadAction } from '../../../crm/actions'
import { getCrmRecord, type CrmView } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Segment, User } from '@/payload-types'

function relationName(value: number | Segment | User | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && value.name) return value.name
  if ('email' in value && value.email) return value.email
  return 'Sin asignar'
}

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
    <main className="workspace-page crm-detail-page">
      <Link className="crm-back-link" href={`/crm?vista=${type}`}>
        <ArrowLeft aria-hidden="true" size={16} /> Volver al CRM
      </Link>

      {(feedback.created || feedback.updated || feedback.converted) && (
        <div className="crm-success" role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          {feedback.created ? 'Registro creado correctamente.' : feedback.updated ? 'Cambios guardados.' : 'Lead convertido a cliente.'}
        </div>
      )}

      <header className="crm-detail-head">
        <div className="crm-detail-identity">
          <span className="crm-detail-avatar"><UserRound aria-hidden="true" size={28} /></span>
          <div>
            <div className="workspace-eyebrow">{isLead ? 'Lead' : 'Cliente'} · #{record.id}</div>
            <h1 className="workspace-title">{name}</h1>
            <p className="workspace-subtitle">{relationName(record.segment)}</p>
          </div>
        </div>
        <div className="workspace-actions">
          {phone && <a className="workspace-button" href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" size={16} /> WhatsApp</a>}
          <Link className="workspace-button" href={`/tasks?${isLead ? 'lead' : 'client'}=${record.id}`}>Crear tarea</Link>
          {convertedId && <Link className="workspace-button workspace-button-primary" href={`/crm/clientes/${convertedId}`}>Ver cliente</Link>}
        </div>
      </header>

      <div className="crm-detail-grid">
        <section className="workspace-card">
          <div className="workspace-card-head">
            <div>
              <h2 className="workspace-card-title">Ficha 360</h2>
              <p className="workspace-card-description">Datos de contacto, estado y contexto interno.</p>
            </div>
          </div>
          <div className="crm-detail-body">
            <dl className="crm-contact-list">
              <div><dt><Mail aria-hidden="true" size={16} /> Email</dt><dd>{email ? <a href={`mailto:${email}`}>{email}</a> : 'Sin email'}</dd></div>
              <div><dt><Phone aria-hidden="true" size={16} /> Teléfono</dt><dd>{phone ? <a href={`tel:${phone}`}>{phone}</a> : 'Sin teléfono'}</dd></div>
              <div><dt><CircleDot aria-hidden="true" size={16} /> Estado</dt><dd>{isLead ? detail.lead!.status : detail.client!.stage}</dd></div>
              {!isLead && <div><dt>Agente</dt><dd>{relationName(detail.client!.assignedAgent)}</dd></div>}
            </dl>

            {context.canEdit ? (
              <form action={isLead ? updateLeadAction : updateClientAction} className="crm-form crm-edit-form">
                <input name="id" type="hidden" value={record.id} />
                <label className="crm-field">
                  <span>Nombre</span>
                  <input name={isLead ? 'fullName' : 'name'} defaultValue={name} maxLength={160} required />
                </label>
                <div className="crm-form-grid">
                  <label className="crm-field"><span>Email</span><input name="email" type="email" defaultValue={email ?? ''} maxLength={240} /></label>
                  <label className="crm-field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={phone ?? ''} maxLength={80} /></label>
                </div>
                <label className="crm-field">
                  <span>{isLead ? 'Estado' : 'Etapa'}</span>
                  {isLead ? (
                    <select name="status" defaultValue={detail.lead!.status}>
                      <option value="nuevo">Nuevo</option><option value="contactado">Contactado</option><option value="calificado">Calificado</option><option value="descartado">Descartado</option>
                    </select>
                  ) : (
                    <select name="stage" defaultValue={detail.client!.stage}>
                      <option value="nuevo">Nuevo</option><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="perdido">Perdido</option>
                    </select>
                  )}
                </label>
                {!isLead && <label className="crm-checkbox"><input name="consent" type="checkbox" defaultChecked={Boolean(detail.client!.consent)} /><span>Consentimiento de contacto</span></label>}
                <label className="crm-field"><span>Notas internas</span><textarea name="notes" rows={5} maxLength={4000} defaultValue={record.notes ?? ''} /></label>
                <button className="workspace-button workspace-button-primary" type="submit">Guardar cambios</button>
              </form>
            ) : (
              <div className="crm-notes"><strong>Notas internas</strong><p>{record.notes || 'Sin notas registradas.'}</p></div>
            )}
          </div>
        </section>

        <aside className="workspace-card crm-timeline-card">
          <div className="workspace-card-head">
            <div>
              <h2 className="workspace-card-title">Timeline</h2>
              <p className="workspace-card-description">Últimas {detail.activities.length} interacciones.</p>
            </div>
            <a className="crm-row-action" aria-label="Abrir actividades en admin" href={`/admin/collections/activities?where[${isLead ? 'lead' : 'client'}][equals]=${record.id}`}><ExternalLink aria-hidden="true" size={16} /></a>
          </div>
          {detail.activities.length === 0 ? (
            <div className="workspace-empty">Todavía no hay actividad para este registro.</div>
          ) : (
            <ol className="crm-timeline">
              {detail.activities.map((activity) => (
                <li key={activity.id}>
                  <span className="crm-timeline-dot" aria-hidden="true" />
                  <div><strong>{activity.summary}</strong><span>{activity.type} · {new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.occurredAt))}</span></div>
                </li>
              ))}
            </ol>
          )}

          {context.canEdit && (
            <details className="crm-activity-add">
              <summary>
                <Plus aria-hidden="true" size={14} /> Registrar actividad
              </summary>
              <form action={createActivityAction} className="crm-form crm-activity-form">
                {isLead
                  ? <input type="hidden" name="lead" value={record.id} />
                  : <input type="hidden" name="client" value={record.id} />}
                <div className="crm-form-grid">
                  <label className="crm-field">
                    <span>Tipo</span>
                    <select name="type" defaultValue="nota">
                      <option value="nota">Nota</option>
                      <option value="llamada">Llamada</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="reunion">Reunión</option>
                      <option value="otro">Otro</option>
                    </select>
                  </label>
                  <label className="crm-field">
                    <span>Fecha y hora</span>
                    <input type="datetime-local" name="occurredAt" />
                  </label>
                </div>
                <label className="crm-field">
                  <span>Resumen</span>
                  <textarea name="summary" rows={3} maxLength={500} placeholder="¿Qué ocurrió? Ej: Llamada de 15 min, acordamos enviar propuesta" required />
                </label>
                <button className="workspace-button workspace-button-primary" type="submit">
                  Guardar actividad
                </button>
              </form>
            </details>
          )}

          {isLead && context.canEdit && !convertedId && (
            <form action={convertLeadAction} className="crm-convert">
              <input name="id" type="hidden" value={record.id} />
              <strong>¿La oportunidad avanzó?</strong>
              <p>Crea un cliente con estos datos y conserva el vínculo con el lead.</p>
              <button className="workspace-button workspace-button-primary" type="submit">Convertir a cliente</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
