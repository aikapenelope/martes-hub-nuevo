import { CrmImportExportDialog } from '@/components/workspace/CrmImportExportDialog'
import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import type { Tenant } from '@/payload-types'
import { Badge } from '@/components/ui/badge'

export function CrmHeader({
  tenant,
  view,
  canEdit,
}: {
  tenant: Tenant
  view: 'leads' | 'clientes' | 'empresas'
  canEdit: boolean
}) {
  const kind = view === 'leads' ? 'lead' : view === 'empresas' ? 'company' : 'client'
  return (
    <section className="border border-border bg-card text-card-foreground p-5 rounded-xl shadow-xs">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
            <span className="flex size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <span>CRM · {tenant.name}</span>
            <Badge variant="outline" className="text-[10px] font-mono capitalize">
              {view}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Relaciones que avanzan</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Pipeline, cartera y contexto comercial del tenant activo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== 'empresas' && (
            <CrmImportExportDialog collection={view === 'leads' ? 'leads' : 'clients'} />
          )}
          {canEdit && <CrmFormDialog kind={kind} />}
        </div>
      </div>
      {!canEdit && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 font-mono" role="status">
          Modo lectura — las modificaciones requieren rol agente o admin.
        </div>
      )}
    </section>
  )
}
