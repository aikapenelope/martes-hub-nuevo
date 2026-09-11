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
import { DirectEmailDrawer } from '@/components/workspace/email/DirectEmailDrawer'
import type { Lead, Client } from '@/payload-types'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EmailCampaign, EmailMessage, Segment } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  sent: 'success',
  sending: 'warning',
  partial: 'warning',
  failed: 'destructive',
  draft: 'outline',
}

export default async function EmailCampaignsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [campaignsRes, segmentsRes, messagesRes, leadsRes, clientsRes] = await Promise.all([
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
    payload.find({
      collection: 'leads',
      where: { tenant: { equals: tenantId } },
      limit: 500,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenantId } },
      limit: 500,
      depth: 0,
      overrideAccess: false,
      user,
    }),
  ])

  const campaigns = campaignsRes.docs as EmailCampaign[]
  const segments = segmentsRes.docs as Segment[]
  const inbox = messagesRes.docs as EmailMessage[]
  const leads = leadsRes.docs as Lead[]
  const clients = clientsRes.docs as Client[]

  const inboundCount = inbox.filter((m) => m.direction === 'inbound').length
  const linkedCount = inbox.filter((m) => m.client || m.lead).length

  const draftCount = campaigns.filter((c) => c.status === 'draft').length
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount ?? 0), 0)
  const totalBounced = campaigns.reduce((acc, c) => acc + (c.bouncedCount ?? 0), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Email · ${context.tenant.name}`}
        title="Email"
        description="Bandeja espejo del buzón (solo lectura) y campañas masivas vía Resend."
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            <DirectEmailDrawer leads={leads} clients={clients} />
            <EmailCampaignCreateDialog segments={segments} testEmail={context.user.email} />
          </div>
        ) : undefined}
      />

      <section>
        <h2 className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Bandeja del buzón · espejo Gmail (solo lectura)
        </h2>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Mensajes espejados" value={inbox.length} icon={Inbox} accent="sky" note="Últimos 30 del buzón" />
          <KpiCard label="Entrantes" value={inboundCount} icon={Mail} accent="cyan" note="Recibidos fuera del CRM" />
          <KpiCard label="Vinculados a ficha" value={linkedCount} icon={Users} accent="indigo" note="Matching contra clients/leads" />
        </div>
        <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
          {inbox.length === 0 ? (
            <div className="py-10 text-center font-mono text-xs text-muted-foreground">
              Sin mensajes espejados todavía — configura GMAIL_SYNC_ENABLED y las credenciales OAuth
              de Google para activar el sync cada 15 min.
            </div>
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
                  <div key={m.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                    <Badge variant={isInbound ? 'success' : 'outline'} className="font-mono text-[10px]">
                      {isInbound ? '↓ entrante' : '↑ enviado'}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-foreground">{m.subject ?? '(sin asunto)'}</strong>
                      <span className="block truncate text-[10px] text-muted-foreground font-mono">
                        {counterpart} · {dateFmt.format(new Date(m.date))}
                      </span>
                      {m.snippet && <span className="block truncate text-[11px] text-muted-foreground">{m.snippet}</span>}
                    </div>
                    {fichaHref && (
                      <Link
                        href={fichaHref}
                        className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      >
                        Ver ficha →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Borradores" value={draftCount} icon={Mail} accent="sky" note="Campañas sin enviar" />
        <KpiCard label="Enviados (histórico)" value={totalSent.toLocaleString('es')} icon={Send} accent="cyan" note={`${campaigns.length} campañas en total`} />
        <KpiCard label="Rebotados" value={totalBounced.toLocaleString('es')} icon={Users} accent="rose" note="Suma histórica de bounces" />
      </section>

      <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
        {campaigns.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin campañas de email todavía.</div>
        ) : (
          <div className="flex flex-col">
            {campaigns.map((c) => {
              const segmentObj = typeof c.segment === 'object' && c.segment ? (c.segment as Segment) : null
              const canSend = c.status === 'draft' || c.status === 'failed'
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-foreground">{c.name}</strong>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {c.subject} · {segmentObj ? segmentObj.name : 'Toda la audiencia'}
                      {c.sentAt && ` · enviada ${dateFmt.format(new Date(c.sentAt))}`}
                    </span>
                    {(c.sentCount ?? 0) > 0 && (
                      <span className="ml-0 mt-0.5 block text-[10px] text-muted-foreground font-mono">
                        {c.sentCount} enviados{(c.bouncedCount ?? 0) > 0 ? ` · ${c.bouncedCount} rebotados` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_VARIANT[c.status ?? 'draft'] ?? 'outline'} className="font-mono text-[10px]">{c.status}</Badge>
                    {canEdit && canSend && (
                      <form action={sendEmailCampaignAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" size="xs" className="font-mono text-[10px] font-bold uppercase tracking-wider">
                          <Send className="size-3" /> Enviar
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
