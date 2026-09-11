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
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="flex size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
          <span className="font-mono uppercase tracking-wider">{tenant.name} · CRM</span>
          <Badge variant="outline" className="text-[10px] font-mono capitalize">
            {view}
          </Badge>
          {!canEdit && (
            <span className="text-[11px] text-amber-400 font-mono">
              (Modo lectura)
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {view === 'leads' ? 'Pipeline de Prospectos' : view === 'clientes' ? 'Cartera de Clientes' : 'Directorio de Empresas'}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {view === 'leads'
            ? 'Seguimiento, velocidad de respuesta y avance comercial de prospectos.'
            : view === 'clientes'
              ? 'Gestión de cuentas activas, planes y relaciones comerciales.'
              : 'Directorio corporativo y cuentas comerciales vinculadas.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view !== 'empresas' && (
          <CrmImportExportDialog collection={view === 'leads' ? 'leads' : 'clients'} />
        )}
        {canEdit && <CrmFormDialog kind={kind} />}
      </div>
    </header>
  )
}
