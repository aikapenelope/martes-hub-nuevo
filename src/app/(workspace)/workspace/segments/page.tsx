/**
 * SegmentsPage — `/workspace/segments`. Rubros usados como filtro en CRM,
 * catálogo de ofertas y audiencia de campañas de email. Antes solo se
 * podían crear/editar desde `/admin` — se usaban en todas partes del
 * workspace pero no tenían ninguna página propia.
 */

import { Layers } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { deleteSegmentAction } from '@/lib/segment-actions'
import { SegmentCreateDialog } from '@/components/workspace/SegmentCreateDialog'
import { EmptyState, OledCard, PageHero } from '@/components/workspace/oled'
import type { Segment } from '@/payload-types'

export default async function SegmentsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit, isAdmin } = context

  const segmentsRes = await payload.find({
    collection: 'segments',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    limit: 200,
    sort: 'name',
    overrideAccess: false,
    user,
  })
  const segments = segmentsRes.docs as Segment[]

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Rubros · ${context.tenant.name}`}
        title="Rubros y Segmentos"
        description="Clasificación de clientes/leads usada en CRM, catálogo y campañas de email."
        actions={canEdit ? <SegmentCreateDialog /> : undefined}
      />

      <OledCard className="!p-0">
        {segments.length === 0 ? (
          <EmptyState>Sin rubros registrados todavía.</EmptyState>
        ) : (
          <div className="flex flex-col">
            {segments.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3 last:border-0">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-zinc-500" />
                  <div>
                    <strong className="block text-sm text-white">{s.name}</strong>
                    {s.description && <span className="text-[11px] text-zinc-500">{s.description}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <form action={deleteSegmentAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-[10px] text-zinc-500 hover:text-red-400 font-mono uppercase">
                      Eliminar
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </OledCard>
    </div>
  )
}
