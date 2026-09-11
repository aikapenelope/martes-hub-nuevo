/**
 * SegmentsPage — `/workspace/segments`. Rubros usados como filtro en CRM,
 * catálogo de ofertas y audiencia de campañas de email — con su uso real:
 * cuántos leads y clientes tiene cada rubro (SQL agregado, group by).
 */

import type { Payload } from 'payload'
import { Layers, Users } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { deleteSegmentAction } from '@/lib/segment-actions'
import { SegmentCreateDialog } from '@/components/workspace/SegmentCreateDialog'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Button } from '@/components/ui/button'
import type { Segment } from '@/payload-types'

interface CountRow {
  segmentId: number | null
  total: number
}

async function countBySegment(payload: Payload, sql: string, tenantId: number): Promise<Map<number, number>> {
  const db = payload.db as { pool?: { query: (text: string, p?: unknown[]) => Promise<{ rows: CountRow[] }> } }
  const map = new Map<number, number>()
  if (!db.pool || typeof db.pool.query !== 'function') return map
  const result = await db.pool.query(sql, [tenantId])
  for (const row of result.rows) {
    if (row.segmentId != null) map.set(row.segmentId, Number(row.total))
  }
  return map
}

export default async function SegmentsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit, isAdmin } = context

  const [segmentsRes, leadCounts, clientCounts] = await Promise.all([
    payload.find({
      collection: 'segments',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      pagination: false,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
    countBySegment(
      payload,
      `SELECT segment_id AS "segmentId", count(*)::int AS total
       FROM leads WHERE tenant_id = $1 AND segment_id IS NOT NULL
       GROUP BY segment_id`,
      tenantId,
    ),
    countBySegment(
      payload,
      `SELECT segment_id AS "segmentId", count(*)::int AS total
       FROM clients WHERE tenant_id = $1 AND segment_id IS NOT NULL
       GROUP BY segment_id`,
      tenantId,
    ),
  ])
  const segments = segmentsRes.docs as Segment[]

  const usedSegments = segments.filter((s) => (leadCounts.get(s.id) ?? 0) + (clientCounts.get(s.id) ?? 0) > 0)
  const totalLeads = [...leadCounts.values()].reduce((a, b) => a + b, 0)
  const totalClients = [...clientCounts.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Rubros · ${context.tenant.name}`}
        title="Rubros y Segmentos"
        description="Clasificación de clientes/leads usada en CRM, catálogo y campañas de email."
        actions={canEdit ? <SegmentCreateDialog /> : undefined}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Rubros" value={segments.length} icon={Layers} accent="sky" note={`${usedSegments.length} en uso`} />
        <KpiCard label="Leads clasificados" value={totalLeads} icon={Users} accent="cyan" note="Con rubro asignado" />
        <KpiCard label="Clientes clasificados" value={totalClients} icon={Users} accent="indigo" note="Con rubro asignado" />
      </section>

      <section className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {segments.length === 0 ? (
          <div className="md:col-span-2 xl:col-span-3">
            <div className="bg-card text-card-foreground border border-border p-3.5">
              <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin rubros registrados todavía.</div>
            </div>
          </div>
        ) : (
          segments.map((s) => {
            const leads = leadCounts.get(s.id) ?? 0
            const clients = clientCounts.get(s.id) ?? 0
            const total = leads + clients
            return (
              <article key={s.id} className="bg-card text-card-foreground border border-border flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center border border-border bg-muted">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div>
                      <strong className="block text-sm text-foreground">{s.name}</strong>
                      {s.description && <span className="text-[11px] text-muted-foreground">{s.description}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <form action={deleteSegmentAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="xs"
                        className="px-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-red-400"
                      >
                        Eliminar
                      </Button>
                    </form>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-2.5 text-center">
                  <div>
                    <p className="text-base font-black text-foreground font-mono">{leads}</p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Leads</p>
                  </div>
                  <div>
                    <p className="text-base font-black text-foreground font-mono">{clients}</p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Clientes</p>
                  </div>
                </div>

                <div className="h-1.5 w-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, total * 10)}%` }}
                  />
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
