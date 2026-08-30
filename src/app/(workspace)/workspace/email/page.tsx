/**
 * EmailCampaignsPage — `/workspace/email`. Campañas de email masivo
 * (Resend). Antes solo se podían crear/enviar desde `/admin`; además el
 * endpoint de envío tenía un bug de ruta que lo dejaba siempre roto (ver
 * fix en EmailCampaigns.ts).
 */

import { Mail, Send, Users } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { sendEmailCampaignAction } from '@/lib/email-campaign-actions'
import { EmailCampaignCreateDialog } from '@/components/workspace/EmailCampaignCreateDialog'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { EmailCampaign, Segment } from '@/payload-types'

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

  const [campaignsRes, segmentsRes] = await Promise.all([
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
  ])

  const campaigns = campaignsRes.docs as EmailCampaign[]
  const segments = segmentsRes.docs as Segment[]

  const draftCount = campaigns.filter((c) => c.status === 'draft').length
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount ?? 0), 0)
  const totalBounced = campaigns.reduce((acc, c) => acc + (c.bouncedCount ?? 0), 0)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Email marketing · ${context.tenant.name}`}
        title="Campañas de Email"
        description="Comunicados masivos vía Resend, segmentados por rubro."
        actions={canEdit ? <EmailCampaignCreateDialog segments={segments} /> : undefined}
      />

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
