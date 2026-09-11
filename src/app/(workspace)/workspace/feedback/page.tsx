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
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
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
      <PageHeader
        eyebrow={`Formularios y satisfacción · ${context.tenant.name}`}
        title="Feedback de Clientes"
        description="Envíos de formularios (Tally) y alertas de queja o baja satisfacción."
        actions={
          <>
            <Link
              href="/workspace/feedback"
              className={!onlyComplaints ? 'px-3.5 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider font-mono' : 'px-3.5 py-2 bg-muted hover:bg-accent border border-border text-foreground text-xs font-bold uppercase tracking-wider font-mono'}
            >
              Todos
            </Link>
            <Link
              href="/workspace/feedback?filtro=quejas"
              className={onlyComplaints ? 'px-3.5 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider font-mono' : 'px-3.5 py-2 bg-muted hover:bg-accent border border-border text-foreground text-xs font-bold uppercase tracking-wider font-mono'}
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

      <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
        <div className="mb-3 flex items-end justify-between gap-4 border-b pb-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{onlyComplaints ? 'Quejas' : 'Todos'}</p>
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Envíos recientes</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Últimos 30 envíos del tenant activo</p>
          </div>
        </div>
        {submissions.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">
            {onlyComplaints ? 'Sin quejas registradas — buena señal.' : 'Sin envíos de formularios todavía.'}
          </div>
        ) : (
          <div className="flex flex-col">
            {submissions.map((s) => {
              const answers = (s.answersJson ?? {}) as Record<string, unknown>
              const answerEntries = Object.entries(answers).slice(0, 6)
              const linkedClient = typeof s.client === 'object' && s.client ? (s.client as Client) : null
              const linkedLead = typeof s.lead === 'object' && s.lead ? (s.lead as Lead) : null
              const person = s.respondentName || s.respondentEmail || s.respondentPhone || 'Anónimo'
              return (
                <div key={s.id} className="border-b border-border p-4 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-foreground">{person}</strong>
                        {s.isComplaint && <Badge variant="destructive" className="font-mono text-[10px]">Queja / Alerta</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
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
                        <div key={label} className="border border-border bg-muted/40 p-2">
                          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</dt>
                          <dd className="mt-0.5 text-xs text-foreground break-words">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
