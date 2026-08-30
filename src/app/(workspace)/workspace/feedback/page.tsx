/**
 * FeedbackPage — `/workspace/feedback`. Envíos de formularios (Tally) y
 * quejas/alertas de satisfacción. Antes solo se veía el % agregado en
 * Analytics — el contenido real de una queja (quién la escribió y qué
 * dijo) solo se podía leer en `/admin`. Los envíos con queja ya generan
 * una notificación y una tarea urgente automáticamente (tallyWebhook.ts);
 * esta página es donde se lee el detalle completo.
 */

import Link from 'next/link'
import { AlertTriangle, FileSpreadsheet, ThumbsUp } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { EmptyState, KpiCard, OledCard, PageHero, SectionHeader, StatusBadge } from '@/components/workspace/oled'
import type { Client, FormSubmission, Lead } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

interface FeedbackSearchParams {
  filtro?: string
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<FeedbackSearchParams>
}) {
  const { filtro } = await searchParams
  const onlyComplaints = filtro === 'quejas'

  const context = await getWorkspaceContext()
  const { payload, user, tenantId } = context

  const [totalRes, complaintsRes, listRes] = await Promise.all([
    payload.find({ collection: 'form-submissions', limit: 0, overrideAccess: false, user, where: { tenant: { equals: tenantId } } }),
    payload.find({ collection: 'form-submissions', limit: 0, overrideAccess: false, user, where: { and: [{ tenant: { equals: tenantId } }, { isComplaint: { equals: true } }] } }),
    payload.find({
      collection: 'form-submissions',
      limit: 30,
      depth: 1,
      sort: '-createdAt',
      overrideAccess: false,
      user,
      where: {
        and: [
          { tenant: { equals: tenantId } },
          ...(onlyComplaints ? [{ isComplaint: { equals: true as const } }] : []),
        ],
      },
    }),
  ])

  const submissions = listRes.docs as FormSubmission[]
  const total = totalRes.totalDocs
  const complaints = complaintsRes.totalDocs
  const satisfactionRate = total > 0 ? Math.round(((total - complaints) / total) * 100) : 100

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Formularios y satisfacción · ${context.tenant.name}`}
        title="Feedback de Clientes"
        description="Envíos de formularios (Tally) y alertas de queja o baja satisfacción."
        actions={
          <>
            <Link
              href="/workspace/feedback"
              className={!onlyComplaints ? 'px-3.5 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono' : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-wider font-mono'}
            >
              Todos
            </Link>
            <Link
              href="/workspace/feedback?filtro=quejas"
              className={onlyComplaints ? 'px-3.5 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono' : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold uppercase tracking-wider font-mono'}
            >
              Solo quejas
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total de envíos" value={total} icon={FileSpreadsheet} accent="sky" note="Todos los formularios del tenant" />
        <KpiCard label="Quejas / Alertas" value={complaints} icon={AlertTriangle} accent="rose" note="Generan notificación + tarea urgente" />
        <KpiCard label="Satisfacción" value={`${satisfactionRate}%`} icon={ThumbsUp} accent="cyan" note="Envíos sin queja sobre el total" />
      </section>

      <OledCard className="!p-0">
        <SectionHeader eyebrow={onlyComplaints ? 'Quejas' : 'Todos'} title="Envíos recientes" description="Últimos 30 envíos del tenant activo" />
        {submissions.length === 0 ? (
          <EmptyState>{onlyComplaints ? 'Sin quejas registradas — buena señal.' : 'Sin envíos de formularios todavía.'}</EmptyState>
        ) : (
          <div className="flex flex-col">
            {submissions.map((s) => {
              const answers = (s.answersJson ?? {}) as Record<string, unknown>
              const answerEntries = Object.entries(answers).slice(0, 6)
              const linkedClient = typeof s.client === 'object' && s.client ? (s.client as Client) : null
              const linkedLead = typeof s.lead === 'object' && s.lead ? (s.lead as Lead) : null
              const person = s.respondentName || s.respondentEmail || s.respondentPhone || 'Anónimo'
              return (
                <div key={s.id} className="border-b border-zinc-900 p-4 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-white">{person}</strong>
                        {s.isComplaint && <StatusBadge tone="danger">Queja / Alerta</StatusBadge>}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {s.formName} · {dateFmt.format(new Date(s.createdAt))}
                        {s.respondentEmail && ` · ${s.respondentEmail}`}
                        {s.respondentPhone && ` · ${s.respondentPhone}`}
                      </span>
                    </div>
                    {linkedClient && (
                      <Link href={`/workspace/crm/clientes/${linkedClient.id}`} className="text-xs text-sky-400 hover:text-sky-300 font-mono">
                        Ver cliente →
                      </Link>
                    )}
                    {!linkedClient && linkedLead && (
                      <Link href={`/workspace/crm/leads/${linkedLead.id}`} className="text-xs text-sky-400 hover:text-sky-300 font-mono">
                        Ver lead →
                      </Link>
                    )}
                  </div>
                  {answerEntries.length > 0 && (
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      {answerEntries.map(([label, value]) => (
                        <div key={label} className="oled-subcard p-2">
                          <dt className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{label}</dt>
                          <dd className="mt-0.5 text-xs text-zinc-200 break-words">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </OledCard>
    </div>
  )
}
