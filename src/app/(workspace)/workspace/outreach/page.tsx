import type { Metadata } from 'next'
import { Target } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Segment, User } from '@/payload-types'
import { OutreachList } from '@/components/workspace/crm/OutreachList'
import { Button } from '@/components/ui/button'
import type { Lead } from '@/payload-types'

export const metadata: Metadata = {
  title: 'Prospección — Martes Hub',
}

/**
 * Prospección manual por WhatsApp: leads interesados con mensajes
 * pre-escritos personalizados; el agente copia y envía por fuera con el
 * enlace wa.me. (El broadcast automático vía OpenBSP queda para el futuro.)
 */
export default async function OutreachPage({
  searchParams,
}: {
  searchParams?: Promise<{ rubro?: string; agente?: string; orden?: string }>
}) {
  const context = await getWorkspaceContext()
  const filters = (await searchParams) ?? {}
  const rubroFilter = filters.rubro && Number.isInteger(Number(filters.rubro)) ? Number(filters.rubro) : null
  const agenteFilter = filters.agente && Number.isInteger(Number(filters.agente)) ? Number(filters.agente) : null
  const orden = filters.orden === 'prioridad' || filters.orden === 'proximos' ? filters.orden : 'recientes'

  // Interesados: nivel templado/caliente o prioridad alta, sin convertir y con teléfono.
  // Paginación completa: ningún interesado elegible se queda fuera de la lista.
  const interestedLeads: Lead[] = []
  let page = 1
  for (;;) {
    const batch = await context.payload.find({
      collection: 'leads',
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { convertedClient: { exists: false } },
          { phone: { exists: true } },
          ...(rubroFilter ? [{ segment: { equals: rubroFilter } }] : []),
          ...(agenteFilter ? [{ assignedTo: { equals: agenteFilter } }] : []),
          {
            or: [
              { nivelInteres: { in: ['templado', 'caliente'] } },
              { prioridad: { equals: 'alta' } },
            ],
          },
        ],
      },
      limit: 500,
      page,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: false,
      user: context.user,
    })
    interestedLeads.push(...(batch.docs as Lead[]))
    if (!batch.hasNextPage) break
    page += 1
  }

  if (orden === 'prioridad') {
    const rank: Record<string, number> = { caliente: 0, templado: 1 }
    interestedLeads.sort((a, b) => {
      const pa = a.prioridad === 'alta' ? 0 : 1
      const pb = b.prioridad === 'alta' ? 0 : 1
      return pa - pb || (rank[a.nivelInteres ?? ''] ?? 2) - (rank[b.nivelInteres ?? ''] ?? 2)
    })
  } else if (orden === 'proximos') {
    interestedLeads.sort((a, b) => {
      const fa = a.fechaProximaLlamada ? Date.parse(a.fechaProximaLlamada) : Infinity
      const fb = b.fechaProximaLlamada ? Date.parse(b.fechaProximaLlamada) : Infinity
      return fa - fb
    })
  }

  // Opciones de filtro: rubros y agentes del tenant
  const [segmentsRes, agentsRes] = await Promise.all([
    context.payload.find({
      collection: 'segments',
      where: { tenant: { equals: context.tenantId } },
      limit: 200,
      depth: 0,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'users',
      where: {
        and: [
          { active: { equals: true } },
          { roles: { in: ['admin', 'agente'] } },
          {
            or: [
              { 'tenants.tenant': { equals: context.tenantId } },
              { roles: { contains: 'admin' } },
            ],
          },
        ],
      },
      limit: 100,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    }),
  ])

  // Último brief por lead (mensaje pre-escrito consultable) — paginado por
  // lotes: los interesados ya no caben en una sola página de briefs.
  const leadIds = interestedLeads.map((l) => l.id)
  const briefsByLead = new Map<number, string>()
  if (leadIds.length > 0) {
    let briefPage = 1
    for (;;) {
      const briefsRes = await context.payload.find({
        collection: 'lead-briefs',
        where: { and: [{ tenant: { equals: context.tenantId } }, { lead: { in: leadIds } }] },
        limit: 500,
        page: briefPage,
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
        // Primer brief por lead = el más reciente (sort -createdAt)
        if (leadId && brief.mensajeWhatsapp && !briefsByLead.has(leadId)) {
          briefsByLead.set(leadId, brief.mensajeWhatsapp)
        }
      }
      if (!briefsRes.hasNextPage) break
      briefPage += 1
    }
  }

  const rows = interestedLeads.map((lead) => ({
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
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Prospección · {context.tenant.name}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Target size={20} className="text-sky-400" /> Lista de salida — interesados
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Mensajes pre-escritos y personalizados: copia y envía por fuera con el enlace de WhatsApp.
          </p>
        </div>
        <span className="border border-border bg-background px-3 py-1 text-[11px] font-mono text-muted-foreground">
          {rows.length} interesado(s)
        </span>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 border border-border bg-background p-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Filtros</span>
        <select
          name="rubro"
          defaultValue={rubroFilter ?? ''}
          aria-label="Filtrar por rubro"
          className="border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los rubros</option>
          {(segmentsRes.docs as Segment[]).map((seg) => (
            <option key={seg.id} value={seg.id}>{seg.name}</option>
          ))}
        </select>
        <select
          name="agente"
          defaultValue={agenteFilter ?? ''}
          aria-label="Filtrar por agente"
          className="border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">Todos los agentes</option>
          {(agentsRes.docs as User[]).map((u) => (
            <option key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</option>
          ))}
        </select>
        <select
          name="orden"
          defaultValue={orden}
          aria-label="Ordenar por"
          className="border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="recientes">Más recientes</option>
          <option value="prioridad">Prioridad / interés</option>
          <option value="proximos">Próxima llamada</option>
        </select>
        <Button type="submit" variant="outline" size="sm" className="font-mono text-[11px] uppercase">
          Aplicar
        </Button>
      </form>

      <OutreachList rows={rows} canEdit={context.canEdit} />
    </div>
  )
}
