/**
 * NotificationsPage — `/workspace/notifications`. Vista de incidentes de
 * canales: notificaciones de error/advertencia (OpenBSP, workers, crons) y
 * emails fallidos o rebotados del email-log. Es la superficie que alimenta
 * el contador de fallos 24h del monitor de salud del cockpit.
 */

import Link from 'next/link'
import { AlertCircle, BellRing, Inbox, MailWarning } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { EmptyState, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { EmailLog, Notification } from '@/payload-types'

const datetimeFmt = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const SEVERITY_META: Record<Notification['severity'], { cls: string; label: string }> = {
  error: { cls: 'text-red-300 border-red-800 bg-red-950/60', label: 'Error' },
  warning: { cls: 'text-amber-300 border-amber-800 bg-amber-950/60', label: 'Advertencia' },
  info: { cls: 'text-sky-300 border-sky-800 bg-sky-950/60', label: 'Info' },
}

export default async function NotificationsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId } = context

  const [notificationsRes, failedEmailsRes] = await Promise.all([
    payload.find({
      collection: 'notifications',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      limit: 50,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'email-log',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { status: { in: ['failed', 'bounced'] } },
        ],
      },
      depth: 0,
      limit: 30,
      sort: '-updatedAt',
      overrideAccess: false,
      user,
    }),
  ])

  const notifications = notificationsRes.docs as Notification[]
  const failedEmails = failedEmailsRes.docs as EmailLog[]

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Operación"
        title="Incidentes de Canales"
        description="Alertas de OpenBSP, workers y crons, más emails fallidos o rebotados. Es la fuente que alimenta el contador de fallos del monitor de salud del cockpit."
        actions={
          <Link
            href="/workspace/email"
            className="px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition"
          >
            Ir a Email Marketing →
          </Link>
        }
      />

      {/* Notificaciones del sistema (openbsp-error-poll y workers) */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-300">
          <BellRing size={14} className="text-amber-400" />
          Notificaciones del sistema ({notifications.length})
        </h2>
        <OledCard className="!p-0">
          {notifications.length === 0 ? (
            <EmptyState>Sin notificaciones registradas. Los canales están tranquilos.</EmptyState>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-900/80">
              {notifications.map((n) => {
                const meta = SEVERITY_META[n.severity ?? 'info']
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <AlertCircle
                      size={16}
                      className={
                        n.severity === 'error'
                          ? 'text-red-400 shrink-0 mt-0.5'
                          : n.severity === 'warning'
                            ? 'text-amber-400 shrink-0 mt-0.5'
                            : 'text-sky-400 shrink-0 mt-0.5'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-white truncate">{n.title}</strong>
                        <span
                          className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 shrink-0 ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        {n.source && (
                          <span className="font-mono text-[9px] uppercase text-zinc-500 border border-zinc-800 px-1.5 py-0.2">
                            {n.source}
                          </span>
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-mono text-zinc-500">
                      {datetimeFmt.format(new Date(n.createdAt))}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </OledCard>
      </section>

      {/* Emails fallidos / rebotados (webhook de Resend) */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-300">
          <MailWarning size={14} className="text-red-400" />
          Emails fallidos o rebotados ({failedEmails.length})
        </h2>
        <OledCard className="!p-0">
          {failedEmails.length === 0 ? (
            <EmptyState>Ningún email marcado como fallido o rebotado.</EmptyState>
          ) : (
            <div className="flex flex-col divide-y divide-zinc-900/80">
              {failedEmails.map((e) => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <Inbox size={16} className="text-zinc-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-zinc-200 truncate font-mono">{e.to}</span>
                      <StatusBadge>{e.status === 'bounced' ? 'Rebotado' : 'Fallido'}</StatusBadge>
                      {e.subject && (
                        <span className="text-[11px] text-zinc-500 truncate">{e.subject}</span>
                      )}
                    </div>
                    {e.error && (
                      <p className="text-[11px] text-red-300/80 mt-0.5 line-clamp-2 font-mono">
                        {e.error}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-mono text-zinc-500">
                    {datetimeFmt.format(new Date(e.updatedAt))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </OledCard>
      </section>
    </div>
  )
}
