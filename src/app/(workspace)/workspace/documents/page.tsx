/**
 * DocumentsPage — `/workspace/documents`. Antes esta colección solo era
 * accesible desde `/admin`; ahora tiene su propia vista dentro del
 * workspace, con la misma UI OLED del resto del producto.
 */

import { FileText, Receipt, File as FileIcon } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { DocumentUploadDialog } from '@/components/workspace/DocumentUploadDialog'
import { EmptyState, KpiCard, OledCard, PageHero } from '@/components/workspace/oled'
import type { Client, Document } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

const TYPE_ICON: Record<string, typeof FileText> = {
  contrato: FileText,
  factura: Receipt,
  otro: FileIcon,
}

export default async function DocumentsPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const [documentsRes, clientsRes] = await Promise.all([
    payload.find({
      collection: 'documents',
      where: { tenant: { equals: tenantId } },
      depth: 1,
      limit: 100,
      sort: '-updatedAt',
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenantId }, stage: { equals: 'activo' } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user,
    }),
  ])

  const documents = documentsRes.docs as Document[]
  const clients = clientsRes.docs as Client[]

  const byType = {
    contrato: documents.filter((d) => d.documentType === 'contrato').length,
    factura: documents.filter((d) => d.documentType === 'factura').length,
    otro: documents.filter((d) => d.documentType === 'otro').length,
  }

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Documentos · ${context.tenant.name}`}
        title="Contratos y Documentos"
        description="Contratos, facturas y archivos PDF por cliente."
        actions={canEdit ? <DocumentUploadDialog clients={clients} /> : undefined}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Contratos" value={byType.contrato} icon={FileText} accent="sky" note="Documentos tipo contrato" />
        <KpiCard label="Facturas" value={byType.factura} icon={Receipt} accent="amber" note="Documentos tipo factura" />
        <KpiCard label="Otros" value={byType.otro} icon={FileIcon} accent="indigo" note="Documentos sin clasificar" />
      </section>

      <OledCard className="!p-0">
        {documents.length === 0 ? (
          <EmptyState>Sin documentos subidos para este tenant todavía.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Título</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Actualizado</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const clientName = typeof d.client === 'object' && d.client ? (d.client as Client).name : `Cliente #${d.client}`
                  const Icon = TYPE_ICON[d.documentType ?? 'otro'] ?? FileIcon
                  return (
                    <tr key={d.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="px-4 py-3 text-white inline-flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-zinc-500" /> {d.title}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{clientName}</td>
                      <td className="px-4 py-3 text-zinc-400 capitalize">{d.documentType}</td>
                      <td className="px-4 py-3 text-zinc-400">{dateFmt.format(new Date(d.updatedAt))}</td>
                      <td className="px-4 py-3 text-right">
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-white text-xs font-mono">
                            Abrir →
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </OledCard>
    </div>
  )
}
