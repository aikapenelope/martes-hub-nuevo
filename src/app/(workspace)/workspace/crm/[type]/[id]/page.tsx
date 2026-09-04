/**
 * CrmRecordPage — `/workspace/crm/[type]/[id]`. Ficha 360 de un lead o
 * cliente: datos de contacto, edición, timeline de actividades y conversión
 * lead→cliente, con la misma UI Storelink del resto del workspace.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleDot,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  UserRound,
  Users,
} from 'lucide-react'

import {
  convertLeadAction,
  createActivityAction,
  updateClientAction,
  updateCompanyAction,
  updateLeadAction,
} from '@/lib/crm-actions'
import { getCrmRecord, type CrmView } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Company, Segment, User } from '@/payload-types'

function relationName(value: number | Segment | User | Company | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && typeof value.name === 'string') return value.name
  if ('firstName' in value && typeof value.firstName === 'string') {
    return `${value.firstName} ${value.lastName ?? ''}`.trim()
  }
  if ('email' in value && typeof value.email === 'string') return value.email
  return 'Sin asignar'
}

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 font-sans'
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
  if (rawType !== 'leads' && rawType !== 'clientes' && rawType !== 'empresas') notFound()
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const type = rawType as CrmView
  const context = await getWorkspaceContext()
  const detail = await getCrmRecord({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    type,
    id,
  })
  if (!detail) notFound()

  const [companiesRes, segmentsRes, agentsRes] = await Promise.all([
    context.payload.find({
      collection: 'companies',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'segments',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'users',
      where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
      depth: 0,
      limit: 100,
      overrideAccess: false,
      user: context.user,
    }),
  ])

  const availableCompanies = companiesRes.docs as Company[]
  const availableSegments = segmentsRes.docs as Segment[]
  const availableAgents = agentsRes.docs as User[]

  const isLead = type === 'leads'
  const isCompany = type === 'empresas'
  const isClient = type === 'clientes'

  const leadRecord = isLead ? detail.lead! : null
  const clientRecord = isClient ? detail.client! : null
  const companyRecord = isCompany ? detail.company! : null

  const name = isLead
    ? leadRecord?.fullName ?? ''
    : isCompany
      ? companyRecord?.name ?? ''
      : clientRecord?.name ?? ''

  const email = isLead ? leadRecord?.email : isCompany ? companyRecord?.email : clientRecord?.email
  const phone = isLead ? leadRecord?.phone : isCompany ? companyRecord?.phone : clientRecord?.phone

  const convertedId =
    isLead && leadRecord?.convertedClient
      ? typeof leadRecord.convertedClient === 'number'
        ? leadRecord.convertedClient
        : leadRecord.convertedClient.id
      : undefined

  const recordSegment = isLead ? leadRecord?.segment : isCompany ? companyRecord?.segment : clientRecord?.segment
  const currentCompanyId = isLead
    ? relId(leadRecord?.company)
    : isClient
      ? relId(clientRecord?.company)
      : null
  const currentSegmentId = relId(recordSegment)
  const currentAgentId = isLead
    ? relId(leadRecord?.assignedTo)
    : isCompany
      ? relId(companyRecord?.assignedAgent)
      : relId(clientRecord?.assignedAgent)

  // Garantizar que las entidades actualmente asignadas nunca se omitan si caen fuera del límite
  if (currentCompanyId && !availableCompanies.some((c) => c.id === currentCompanyId)) {
    try {
      const missingCompany = await context.payload.findByID({
        collection: 'companies',
        id: currentCompanyId,
        depth: 0,
        overrideAccess: true,
      })
      if (missingCompany && missingCompany.tenant === context.tenantId) {
        availableCompanies.unshift(missingCompany as Company)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

  if (currentSegmentId && !availableSegments.some((s) => s.id === currentSegmentId)) {
    try {
      const missingSegment = await context.payload.findByID({
        collection: 'segments',
        id: currentSegmentId,
        depth: 0,
        overrideAccess: true,
      })
      if (missingSegment && missingSegment.tenant === context.tenantId) {
        availableSegments.unshift(missingSegment as Segment)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

  if (currentAgentId && !availableAgents.some((a) => a.id === currentAgentId)) {
    try {
      const missingAgent = await context.payload.findByID({
        collection: 'users',
        id: currentAgentId,
        depth: 0,
        overrideAccess: true,
      })
      // Misma regla que validateTenantAgent (crm-actions): el agente debe
      // pertenecer al tenant activo o ser admin global. Sin este check —que
      // sí tienen los fallbacks de company y segment— un ID adivinado filtraba
      // el nombre de un usuario de otro tenant en el dropdown.
      const agentTenants = (missingAgent?.tenants || []).map((t) =>
        typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant,
      )
      const isTenantAgent =
        agentTenants.includes(context.tenantId) || Boolean(missingAgent?.roles?.includes('admin'))
      if (missingAgent && isTenantAgent) {
        availableAgents.unshift(missingAgent as User)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

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
          <span className="flex h-11 w-11 items-center justify-center border border-zinc-700 bg-zinc-900 text-white">
            {isCompany ? (
              <Building2 className="w-5 h-5" aria-hidden="true" />
            ) : (
              <UserRound className="w-5 h-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              {isLead ? 'Lead' : isCompany ? 'Empresa / Cuenta' : 'Cliente'} · #{id}
            </div>
            <h1 className="text-xl font-bold text-white">{name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>{relationName(recordSegment)}</span>
              {isLead && leadRecord?.estimatedValue != null && leadRecord.estimatedValue > 0 && (
                <span className="font-mono text-emerald-400 font-semibold">
                  · Valor: ${leadRecord.estimatedValue}
                </span>
              )}
              {isCompany && companyRecord?.taxId && (
                <span className="font-mono text-zinc-400">· RIF: {companyRecord.taxId}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.conversations.length > 0 && (
            <Link
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              href={`/workspace/inbox?c=${detail.conversations[0].id}`}
            >
              Abrir en inbox
            </Link>
          )}
          {phone && (
            <a
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5"
              href={`https://wa.me/${phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp
            </a>
          )}
          {!isCompany && (
            <Link
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              href={`/workspace/tasks?${isLead ? 'lead' : 'client'}=${id}`}
            >
              Crear tarea
            </Link>
          )}
          {convertedId && (
            <Link
              className="px-3 py-1.5 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono"
              href={`/workspace/crm/clientes/${convertedId}`}
            >
              Ver cliente
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <div className="space-y-4">
          <section className="oled-card p-5">
            <h2 className="text-base font-bold text-white">
              {isCompany ? 'Ficha de la Empresa' : 'Ficha 360'}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Datos comerciales, estado y contexto interno.</p>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase">
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
                </dt>
                <dd className="mt-1 text-white">
                  {email ? <a href={`mailto:${email}`}>{email}</a> : 'Sin email'}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase">
                  <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Teléfono
                </dt>
                <dd className="mt-1 text-white">
                  {phone ? <a href={`tel:${phone}`}>{phone}</a> : 'Sin teléfono'}
                </dd>
              </div>
              {isCompany ? (
                <>
                  <div>
                    <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase">
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" /> Sitio Web
                    </dt>
                    <dd className="mt-1 text-white">
                      {companyRecord?.website ? (
                        <a href={companyRecord.website} target="_blank" rel="noreferrer" className="underline">
                          {companyRecord.website}
                        </a>
                      ) : (
                        'Sin sitio web'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Ubicación
                    </dt>
                    <dd className="mt-1 text-white">
                      {companyRecord?.city ? `${companyRecord.city}${companyRecord.state ? `, ${companyRecord.state}` : ''}` : 'Sin ciudad'}
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="flex items-center gap-1.5 text-zinc-500 font-mono uppercase">
                      <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Estado
                    </dt>
                    <dd className="mt-1 text-white">
                      {isLead ? leadRecord?.status : clientRecord?.stage}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500 font-mono uppercase">
                      {isLead ? 'Empresa vinculada' : 'Agente'}
                    </dt>
                    <dd className="mt-1 text-white">
                      {isLead
                        ? relationName(leadRecord?.company)
                        : relationName(clientRecord?.assignedAgent)}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {context.canEdit ? (
              <form
                action={
                  isCompany
                    ? updateCompanyAction
                    : isLead
                      ? updateLeadAction
                      : updateClientAction
                }
                className="mt-5 flex flex-col gap-3"
              >
                <input name="id" type="hidden" value={id} />

                {/* Nombre de la entidad */}
                <label className={labelCls}>
                  {isCompany ? 'Nombre de la empresa' : isLead ? 'Nombre completo' : 'Nombre del contacto'}
                  <input
                    name={isLead ? 'fullName' : 'name'}
                    defaultValue={name}
                    maxLength={160}
                    required
                    className={inputCls}
                  />
                </label>

                {/* Email y Teléfono */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={email ?? ''}
                      maxLength={240}
                      className={inputCls}
                    />
                  </label>
                  <label className={labelCls}>
                    Teléfono
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={phone ?? ''}
                      maxLength={80}
                      className={inputCls}
                    />
                  </label>
                </div>

                {isCompany && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        RIF / CIF / Identificador Fiscal
                        <input
                          name="taxId"
                          defaultValue={companyRecord?.taxId ?? ''}
                          maxLength={50}
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Sitio Web
                        <input
                          name="website"
                          type="url"
                          defaultValue={companyRecord?.website ?? ''}
                          maxLength={255}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Ciudad
                        <input
                          name="city"
                          defaultValue={companyRecord?.city ?? ''}
                          maxLength={100}
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Estado / Región
                        <input
                          name="state"
                          defaultValue={companyRecord?.state ?? ''}
                          maxLength={100}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <label className={labelCls}>
                      Dirección física / Local
                      <input
                        name="address"
                        defaultValue={companyRecord?.address ?? ''}
                        maxLength={255}
                        className={inputCls}
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Segmento / Rubro
                        <select
                          name="segment"
                          defaultValue={relId(companyRecord?.segment) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin segmento</option>
                          {availableSegments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Agente asignado
                        <select
                          name="assignedAgent"
                          defaultValue={relId(companyRecord?.assignedAgent) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin agente</option>
                          {availableAgents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : a.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {!isCompany && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Empresa (Cuenta)
                        <select
                          name="company"
                          defaultValue={currentCompanyId ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin empresa vinculada</option>
                          {availableCompanies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        {isLead ? 'Cargo / Posición' : 'Nombre de empresa (texto)'}
                        <input
                          name={isLead ? 'position' : 'companyName'}
                          defaultValue={
                            isLead ? leadRecord?.position ?? '' : clientRecord?.companyName ?? ''
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        {isLead ? 'Estado' : 'Etapa'}
                        {isLead ? (
                          <select
                            name="status"
                            defaultValue={leadRecord?.status ?? 'nuevo'}
                            className={inputCls}
                          >
                            <option value="nuevo">Nuevo</option>
                            <option value="contactado">Contactado</option>
                            <option value="calificado">Calificado</option>
                            <option value="descartado">Descartado</option>
                          </select>
                        ) : (
                          <select
                            name="stage"
                            defaultValue={clientRecord?.stage ?? 'nuevo'}
                            className={inputCls}
                          >
                            <option value="nuevo">Nuevo</option>
                            <option value="activo">Activo</option>
                            <option value="inactivo">Inactivo</option>
                            <option value="perdido">Perdido</option>
                          </select>
                        )}
                      </label>

                      <label className={labelCls}>
                        Rubro / Segmento
                        <select
                          name="segment"
                          defaultValue={relId(recordSegment) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin segmento</option>
                          {availableSegments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {isLead && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={labelCls}>
                          Canal de origen
                          <select
                            name="source"
                            defaultValue={leadRecord?.source ?? 'manual'}
                            className={inputCls}
                          >
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
                          Valor estimado (USD)
                          <input
                            name="estimatedValue"
                            type="number"
                            step="1"
                            defaultValue={leadRecord?.estimatedValue ?? ''}
                            placeholder="Ej: 1500"
                            className={inputCls}
                          />
                        </label>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Agente asignado
                        <select
                          name={isLead ? 'assignedTo' : 'assignedAgent'}
                          defaultValue={
                            relId(isLead ? leadRecord?.assignedTo : clientRecord?.assignedAgent) ?? ''
                          }
                          className={inputCls}
                        >
                          <option value="">Sin asignar</option>
                          {availableAgents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : a.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Ciudad
                        <input
                          name="city"
                          defaultValue={(isLead ? leadRecord?.city : clientRecord?.city) ?? ''}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    {isClient && (
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          name="consent"
                          type="checkbox"
                          defaultChecked={Boolean(clientRecord?.consent)}
                        />{' '}
                        Consentimiento de contacto
                      </label>
                    )}
                  </>
                )}

                <label className={labelCls}>
                  Comentarios comerciales
                  <textarea
                    name="commercialNotes"
                    rows={3}
                    maxLength={4000}
                    defaultValue={
                      (isLead
                        ? leadRecord?.commercialNotes
                        : isCompany
                          ? companyRecord?.commercialNotes
                          : clientRecord?.commercialNotes) ?? ''
                    }
                    placeholder="Estrategia de cierre, objeciones principales o notas de negociación..."
                    className={inputCls}
                  />
                </label>

                <label className={labelCls}>
                  Notas internas
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={4000}
                    defaultValue={
                      (isLead ? leadRecord?.notes : isCompany ? companyRecord?.notes : clientRecord?.notes) ?? ''
                    }
                    className={inputCls}
                  />
                </label>

                <button
                  type="submit"
                  className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono"
                >
                  Guardar cambios
                </button>
              </form>
            ) : (
              <div className="mt-5 border border-zinc-800 bg-black p-3 text-xs text-zinc-300">
                <strong className="text-white">Notas internas</strong>
                <p className="mt-1">
                  {(isLead ? leadRecord?.notes : isCompany ? companyRecord?.notes : clientRecord?.notes) ||
                    'Sin notas registradas.'}
                </p>
              </div>
            )}
          </section>

          {/* Si es una empresa, mostrar sus contactos asociados (Leads y Clientes) */}
          {isCompany && (
            <section className="oled-card p-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <h2 className="text-base font-bold text-white">Contactos asociados</h2>
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                Personas registradas en el CRM vinculadas a esta empresa.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Clientes ({detail.relatedClients?.length ?? 0})
                  </h3>
                  {(!detail.relatedClients || detail.relatedClients.length === 0) ? (
                    <p className="mt-1 text-xs text-zinc-500">Ningún cliente activo vinculado.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-zinc-900 border border-zinc-900">
                      {detail.relatedClients.map((c) => (
                        <li key={c.id} className="flex items-center justify-between p-2.5 text-xs">
                          <div>
                            <Link
                              href={`/workspace/crm/clientes/${c.id}`}
                              className="font-semibold text-white hover:underline"
                            >
                              {c.name}
                            </Link>
                            <span className="block text-[10px] text-zinc-500 font-mono">
                              {c.email || c.phone || 'Sin datos de contacto'} · Etapa: {c.stage}
                            </span>
                          </div>
                          <Link
                            href={`/workspace/crm/clientes/${c.id}`}
                            className="text-xs text-sky-400 hover:text-sky-300 font-mono"
                          >
                            Ver ficha →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Leads en prospección ({detail.relatedLeads?.length ?? 0})
                  </h3>
                  {(!detail.relatedLeads || detail.relatedLeads.length === 0) ? (
                    <p className="mt-1 text-xs text-zinc-500">Ningún prospecto vinculado.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-zinc-900 border border-zinc-900">
                      {detail.relatedLeads.map((l) => (
                        <li key={l.id} className="flex items-center justify-between p-2.5 text-xs">
                          <div>
                            <Link
                              href={`/workspace/crm/leads/${l.id}`}
                              className="font-semibold text-white hover:underline"
                            >
                              {l.fullName}
                            </Link>
                            <span className="block text-[10px] text-zinc-500 font-mono">
                              {l.email || l.phone || 'Sin datos de contacto'} · Estado: {l.status}
                            </span>
                          </div>
                          <Link
                            href={`/workspace/crm/leads/${l.id}`}
                            className="text-xs text-sky-400 hover:text-sky-300 font-mono"
                          >
                            Ver ficha →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

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

          {!isCompany && context.canEdit && (
            <details className="mt-4 border border-zinc-800 bg-black">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs text-zinc-300 font-mono uppercase">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Registrar actividad
              </summary>
              <form action={createActivityAction} className="flex flex-col gap-3 p-3">
                {isLead ? (
                  <input type="hidden" name="lead" value={id} />
                ) : (
                  <input type="hidden" name="client" value={id} />
                )}
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
                  <label className={labelCls}>
                    Fecha y hora
                    <input type="datetime-local" name="occurredAt" className={inputCls} />
                  </label>
                </div>
                <label className={labelCls}>
                  Resumen
                  <textarea
                    name="summary"
                    rows={3}
                    maxLength={500}
                    placeholder="¿Qué ocurrió? Ej: Llamada de 15 min, acordamos enviar propuesta"
                    required
                    className={inputCls}
                  />
                </label>
                <button
                  type="submit"
                  className="self-start px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono"
                >
                  Guardar actividad
                </button>
              </form>
            </details>
          )}

          {isLead && context.canEdit && !convertedId && (
            <form action={convertLeadAction} className="mt-4 border border-zinc-800 bg-black p-3">
              <input name="id" type="hidden" value={id} />
              <strong className="block text-xs text-white">¿La oportunidad avanzó?</strong>
              <p className="mt-1 text-xs text-zinc-400">
                Crea un cliente con estos datos y conserva el vínculo con el lead.
              </p>
              <button
                type="submit"
                className="mt-2 px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono"
              >
                Convertir a cliente
              </button>
            </form>
          )}
        </aside>
      </div>
    </>
  )
}
