/**
 * DocumentsPage — `/workspace/documents`. Antes esta colección solo era
 * accesible desde `/admin`; ahora tiene su propia vista dentro del
 * workspace, con la misma UI OLED del resto del producto.
 */

import { FileText, Receipt, File as FileIcon } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { DocumentUploadDialog } from '@/components/workspace/DocumentUploadDialog'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
      <PageHeader
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

      <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
        {documents.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin documentos subidos para este tenant todavía.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-xs">
              <TableHeader>
                <TableRow className="border-b font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <TableHead className="px-4 py-2.5 font-medium">Título</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">Cliente</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">Tipo</TableHead>
                  <TableHead className="px-4 py-2.5 font-medium">Actualizado</TableHead>
                  <TableHead className="px-4 py-2.5"><span className="sr-only">Abrir</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => {
                  const clientName = typeof d.client === 'object' && d.client ? (d.client as Client).name : `Cliente #${d.client}`
                  const Icon = TYPE_ICON[d.documentType ?? 'otro'] ?? FileIcon
                  return (
                    <TableRow key={d.id} className="border-b hover:bg-muted/40">
                      <TableCell className="inline-flex items-center gap-2 px-4 py-3 text-foreground">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {d.title}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{clientName}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground capitalize">{d.documentType}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">{dateFmt.format(new Date(d.updatedAt))}</TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                            Abrir →
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
