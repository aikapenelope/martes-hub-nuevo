'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, RefreshCw, Send } from 'lucide-react'
import type { Client, Tenant } from '@/payload-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import { cn } from '@/lib/utils'
import type { TimeRangeKey } from './types'

interface CockpitCommandStripProps {
  tenant: Tenant
  dateTitle: string
  canEdit: boolean
  clients: Client[] | null
  timeRange: TimeRangeKey
}

const RANGES: { key: TimeRangeKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 Días' },
  { key: '30d', label: '30 Días' },
  { key: '90d', label: 'Trimestre' },
  { key: 'ano', label: 'Año' },
]

/**
 * Accesos rápidos del cockpit con selector de rango temporal interactivo
 * y creación in-situ de leads y cobros.
 */
export function CockpitCommandStrip({
  tenant,
  dateTitle,
  canEdit,
  clients,
  timeRange,
}: CockpitCommandStripProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleRangeChange = (newRange: TimeRangeKey) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('rango', newRange)
    router.push(`/workspace?${params.toString()}`)
  }

  const handleRefresh = () => {
    router.refresh()
  }

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border border-border bg-card p-4 sm:p-5 text-card-foreground">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
          <span className="uppercase tracking-wider font-medium text-[11px]">
            Operación en línea · {dateTitle}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Torre de Control Comercial
          </h1>
          <Badge variant="outline" className="text-xs font-medium tracking-wide">
            {tenant.name}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Selector de Rango Temporal */}
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40">
          <span className="px-2 text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Rango:</span>
          </span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleRangeChange(r.key)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                timeRange === r.key
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Botón Refrescar Datos */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          title="Sincronizar métricas en tiempo real"
          className="size-8"
        >
          <RefreshCw className="size-3.5" />
          <span className="sr-only">Actualizar datos</span>
        </Button>

        {canEdit ? (
          <>
            <CrmFormDialog kind="lead" variant="secondary" label="+ Lead" />
            <PaymentCreateDialog clients={clients} variant="secondary" />
          </>
        ) : (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/workspace/crm">Ir al CRM</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/workspace/billing">Facturación</Link>
            </Button>
          </>
        )}

        <Button asChild size="sm" className="gap-1.5">
          <Link href="/workspace/inbox">
            <Send className="size-3.5" />
            <span>Ir al Inbox</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}


