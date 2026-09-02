import { CrmImportExportDialog } from '@/components/workspace/CrmImportExportDialog'
import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import type { Tenant } from '@/payload-types'

export function CrmHeader({
  tenant,
  view,
  canEdit,
}: {
  tenant: Tenant
  view: 'leads' | 'clientes'
  canEdit: boolean
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
            <span className="w-2 h-2 bg-white inline-block" />
            <span>CRM · {tenant.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Relaciones que avanzan</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Pipeline, cartera y contexto comercial del tenant activo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CrmImportExportDialog collection={view === 'leads' ? 'leads' : 'clients'} />
          {canEdit && <CrmFormDialog kind={view === 'leads' ? 'lead' : 'client'} />}
        </div>
      </div>
      {!canEdit && (
        <p className="mt-3 border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400 font-mono" role="status">
          Modo lectura — las modificaciones requieren rol agente o admin.
        </p>
      )}
    </section>
  )
}
