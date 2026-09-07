import type { Metadata } from 'next'
import { Target } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { OutreachList } from '@/components/workspace/crm/OutreachList'
import type { Lead } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Prospección — Martes Hub',
}

/**
 * Prospección manual por WhatsApp: leads interesados con mensajes
 * pre-escritos personalizados; el agente copia y envía por fuera con el
 * enlace wa.me. (El broadcast automático vía OpenBSP queda para el futuro.)
 */
export default async function OutreachPage() {
  const context = await getWorkspaceContext()

  // Interesados: nivel templado/caliente o prioridad alta, sin convertir y con teléfono
  const leadsRes = await context.payload.find({
    collection: 'leads',
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        { convertedClient: { exists: false } },
        { phone: { exists: true } },
        {
          or: [
            { nivelInteres: { in: ['templado', 'caliente'] } },
            { prioridad: { equals: 'alta' } },
          ],
        },
      ],
    },
    limit: 100,
    depth: 0,
    sort: '-updatedAt',
    overrideAccess: false,
    user: context.user,
  })

  // Último brief por lead (mensaje pre-escrito consultable)
  const leadIds = (leadsRes.docs as Lead[]).map((l) => l.id)
  const briefsByLead = new Map<number, string>()
  if (leadIds.length > 0) {
    const briefsRes = await context.payload.find({
      collection: 'lead-briefs',
      where: { and: [{ tenant: { equals: context.tenantId } }, { lead: { in: leadIds } }] },
      limit: 200,
      depth: 0,
      sort: '-createdAt',
      overrideAccess: false,
      user: context.user,
    })
    for (const brief of briefsRes.docs as unknown as Array<{ lead?: unknown; mensajeWhatsapp?: string | null }>) {
      const leadId =
        typeof brief.lead === 'object' && brief.lead !== null
          ? (brief.lead as { id: number }).id
          : (brief.lead as number | undefined)
      if (leadId && brief.mensajeWhatsapp && !briefsByLead.has(leadId)) {
        briefsByLead.set(leadId, brief.mensajeWhatsapp)
      }
    }
  }

  const rows = (leadsRes.docs as Lead[]).map((lead) => ({
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone ?? '',
    nivelInteres: lead.nivelInteres ?? null,
    prioridad: lead.prioridad ?? null,
    servicioInteres: lead.servicioInteres ?? null,
    numeroDeLlamadas: lead.numeroDeLlamadas ?? 0,
    crmUrl: `/workspace/crm/leads/${lead.id}`,
    prewritten: briefsByLead.get(lead.id) ?? null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
            Prospección · {context.tenant.name}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-white">
            <Target size={20} className="text-sky-400" /> Lista de salida — interesados
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Mensajes pre-escritos y personalizados: copia y envía por fuera con el enlace de WhatsApp.
          </p>
        </div>
        <span className="border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-mono text-zinc-400">
          {rows.length} interesado(s)
        </span>
      </div>

      <OutreachList rows={rows} canEdit={context.canEdit} />
    </div>
  )
}
