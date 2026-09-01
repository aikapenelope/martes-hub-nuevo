/**
 * MediaPage — `/workspace/media`. Biblioteca de archivos del tenant
 * (imágenes de marcas, PDFs, adjuntos de campañas). Subida de nuevos
 * archivos en /admin (Payload gestiona el upload); aquí se exploran y
 * se copia la URL pública para usarla en plantillas y campañas.
 */

import { ExternalLink, File as FileIcon, FileType2, HardDrive, Image as ImageIcon } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { EmptyState, KpiCard, OledCard, PageHero } from '@/components/workspace/oled'
import type { Media as MediaDoc } from '@/payload-types'

const sizeFmt = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const dateFmt = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

export default async function MediaPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId } = context

  const mediaRes = await payload.find({
    collection: 'media',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    pagination: false,
    sort: '-createdAt',
    overrideAccess: false,
    user,
  })
  const media = mediaRes.docs as MediaDoc[]

  const images = media.filter((m) => m.mimeType?.startsWith('image/'))
  const totalBytes = media.reduce((acc, m) => acc + (m.filesize ?? 0), 0)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Biblioteca · ${context.tenant.name}`}
        title="Media y Archivos"
        description="Imágenes y documentos del tenant. Sube archivos nuevos desde el admin de Payload."
        actions={
          <a
            href="/admin/collections/media?limit=10"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-sky-400 px-4 py-2 text-xs font-black uppercase shadow-[0_0_16px_rgba(56,189,248,0.35)] transition hover:bg-sky-300 font-mono text-black"
          >
            <ExternalLink className="h-4 w-4" /> Subir en Admin
          </a>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Archivos" value={media.length} icon={FileType2} accent="sky" note="En la biblioteca del tenant" />
        <KpiCard label="Imágenes" value={images.length} icon={ImageIcon} accent="cyan" note="Usables en campañas y CRM" />
        <KpiCard label="Espacio usado" value={sizeFmt(totalBytes)} icon={HardDrive} accent="indigo" note="Suma de todos los archivos" />
      </section>

      {media.length === 0 ? (
        <OledCard>
          <EmptyState>Sin archivos todavía — sube el primero desde el admin de Payload.</EmptyState>
        </OledCard>
      ) : (
        <section className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {media.map((m) => {
            const isImage = m.mimeType?.startsWith('image/')
            const dims = m.width && m.height ? `${m.width}×${m.height}` : null
            return (
              <article key={m.id} className="oled-card flex flex-col overflow-hidden p-0">
                <div className="flex h-28 items-center justify-center border-b border-zinc-900 bg-zinc-950">
                  {isImage && m.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URLs dinámicas de media propia (payload uploads), no requieren optimización del loader
                    <img src={m.url} alt={m.alt} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <FileIcon className="h-8 w-8 text-zinc-600" />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-xs font-semibold text-white" title={m.filename ?? undefined}>{m.filename}</p>
                  <p className="text-[10px] font-mono text-zinc-500">
                    {sizeFmt(m.filesize ?? 0)}{dims ? ` · ${dims}` : ''}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] font-mono uppercase text-zinc-600">{dateFmt.format(new Date(m.createdAt))}</span>
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-sky-400 hover:text-sky-300" title="Copiar/abrir URL pública">
                        URL →
                      </a>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
