/**
 * EmailCampaignsPage — `/workspace/email`. Campañas de email masivo
 * (Resend). Antes solo se podían crear/enviar desde `/admin`; además el
 * endpoint de envío tenía un bug de ruta que lo dejaba siempre roto (ver
 * fix en EmailCampaigns.ts).
 */

import Link from 'next/link'
import { Inbox, Mail, Send, Users } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { sendEmailCampaignAction } from '@/lib/email-campaign-actions'
import { EmailCampaignCreateDialog } from '@/components/workspace/EmailCampaignCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { EmailCampaign, EmailMessage, Segment } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  sent: 'success',
  sending: 'warning',
  partial: 'warning',
  failed: 'danger',
  draft: 'neutral',
}

export default async function EmailCampaignsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [campaignsRes, segmentsRes, messagesRes] = await Promise.all([
    payload.find({
      collection: 'email-campaigns',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 50,
      sort: '-createdAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'segments',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    // Bandeja de solo lectura: espejo del buzón (job sync-email). Muestra lo
    // que realmente se habló por email fuera del CRM — la parte que Twenty
    // resuelve con el mailbox sync bidireccional, aquí sin envío desde el CRM.
    payload.find({
      collection: 'email-messages',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 30,
      sort: '-date',
      overrideAccess: false,
      user,
    }),
  ])

  const campaigns = campaignsRes.docs as EmailCampaign[]
  const segments = segmentsRes.docs as Segment[]
  const inbox = messagesRes.docs as EmailMessage[]

  const inboundCount = inbox.filter((m) => m.direction === 'inbound').length
  const linkedCount = inbox.filter((m) => m.client || m.lead).length

  const draftCount = campaigns.filter((c) => c.status === 'draft').length
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount ?? 0), 0)
  const totalBounced = campaigns.reduce((acc, c) => acc + (c.bouncedCount ?? 0), 0)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Email · ${context.tenant.name}`}
        title="Email"
        description="Bandeja espejo del buzón (solo lectura) y campañas masivas vía Resend."
        actions={canEdit ? <EmailCampaignCreateDialog segments={segments} /> : undefined}
      />

      <section>
        <h2 className="mb-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
          Bandeja del buzón · espejo Gmail (solo lectura)
        </h2>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Mensajes espejados" value={inbox.length} icon={Inbox} accent="sky" note="Últimos 30 del buzón" />
          <KpiCard label="Entrantes" value={inboundCount} icon={Mail} accent="cyan" note="Recibidos fuera del CRM" />
          <KpiCard label="Vinculados a ficha" value={linkedCount} icon={Users} accent="indigo" note="Matching contra clients/leads" />
        </div>
        <OledCard className="!p-0">
          {inbox.length === 0 ? (
            <EmptyState>
              Sin mensajes espejados todavía — configura GMAIL_SYNC_ENABLED y las credenciales OAuth
              de Google para activar el sync cada 15 min.
            </EmptyState>
          ) : (
            <div className="flex flex-col">
              {inbox.map((m) => {
                const clientObj = typeof m.client === 'object' && m.client ? m.client : null
                const leadObj = typeof m.lead === 'object' && m.lead ? m.lead : null
                const isInbound = m.direction === 'inbound'
                const counterpart = isInbound ? (m.fromName ?? m.fromEmail ?? '—') : (m.toEmails ?? '—')
                const fichaHref = clientObj
                  ? `/workspace/crm/clientes/${clientObj.id}`
                  : leadObj
                    ? `/workspace/crm/leads/${leadObj.id}`
                    : null
                return (
                  <div key={m.id} className="flex items-center gap-3 border-b border-zinc-900 px-4 py-3 last:border-0">
                    <StatusBadge tone={isInbound ? 'success' : 'neutral'}>
                      {isInbound ? '↓ entrante' : '↑ enviado'}
                    </StatusBadge>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-white">{m.subject ?? '(sin asunto)'}</strong>
                      <span className="block truncate text-[10px] text-zinc-500 font-mono">
                        {counterpart} · {dateFmt.format(new Date(m.date))}
                      </span>
                      {m.snippet && <span className="block truncate text-[11px] text-zinc-400">{m.snippet}</span>}
                    </div>
                    {fichaHref && (
                      <Link
                        href={fichaHref}
                        className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white"
                      >
                        Ver ficha →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </OledCard>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Borradores" value={draftCount} icon={Mail} accent="sky" note="Campañas sin enviar" />
        <KpiCard label="Enviados (histórico)" value={totalSent.toLocaleString('es')} icon={Send} accent="cyan" note={`${campaigns.length} campañas en total`} />
        <KpiCard label="Rebotados" value={totalBounced.toLocaleString('es')} icon={Users} accent="rose" note="Suma histórica de bounces" />
      </section>

      <OledCard className="!p-0">
        {campaigns.length === 0 ? (
          <EmptyState>Sin campañas de email todavía.</EmptyState>
        ) : (
          <div className="flex flex-col">
            {campaigns.map((c) => {
              const segmentObj = typeof c.segment === 'object' && c.segment ? (c.segment as Segment) : null
              const canSend = c.status === 'draft' || c.status === 'failed'
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-white">{c.name}</strong>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {c.subject} · {segmentObj ? segmentObj.name : 'Toda la audiencia'}
                      {c.sentAt && ` · enviada ${dateFmt.format(new Date(c.sentAt))}`}
                    </span>
                    {(c.sentCount ?? 0) > 0 && (
                      <span className="ml-0 mt-0.5 block text-[10px] text-zinc-400 font-mono">
                        {c.sentCount} enviados{(c.bouncedCount ?? 0) > 0 ? ` · ${c.bouncedCount} rebotados` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge tone={STATUS_TONE[c.status ?? 'draft'] ?? 'neutral'}>{c.status}</StatusBadge>
                    {canEdit && canSend && (
                      <form action={sendEmailCampaignAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="px-2.5 py-1 bg-white text-black text-[10px] font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1">
                          <Send size={11} /> Enviar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OledCard>
    </div>
  )
}
