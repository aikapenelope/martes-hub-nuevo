'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, RefreshCw, Send } from 'lucide-react'
import type { Client, Tenant } from '@/payload-types'
import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'
import type { TimeRangeKey } from './types'

interface CockpitCommandStripProps {
  tenant: Tenant
  dateTitle: string
  canEdit: boolean
  clients: Client[]
  timeRange: TimeRangeKey
}

const RANGES: { key: TimeRangeKey; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 Días' },
  { key: '30d', label: 'Mes (30D)' },
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
    <section className="p-4 oled-card bracket-accent flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 uppercase tracking-widest mb-1">
          <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" />
          <span>Operación en línea · {dateTitle.toUpperCase()}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-3 font-mono uppercase">
          Torre de Control Comercial
          <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/25">
            {tenant.name}
          </span>
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
        {/* Selector de Rango Temporal */}
        <div className="inline-flex items-center bg-zinc-950 border border-zinc-800 p-0.5">
          <span className="px-2 text-zinc-500 flex items-center gap-1 text-[11px]">
            <Calendar size={12} className="text-zinc-400" />
            <span className="hidden sm:inline">Rango:</span>
          </span>
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => handleRangeChange(r.key)}
              className={`px-2 py-1 text-[10px] font-bold uppercase transition ${
                timeRange === r.key
                  ? 'bg-sky-400 text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Botón Refrescar Datos */}
        <button
          type="button"
          onClick={handleRefresh}
          title="Sincronizar métricas en tiempo real"
          className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition"
        >
          <RefreshCw size={14} />
        </button>

        {canEdit ? (
          <>
            <CrmFormDialog kind="lead" variant="secondary" label="+ Lead" />
            <PaymentCreateDialog clients={clients} variant="secondary" />
          </>
        ) : (
          <>
            <Link
              href="/workspace/crm"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition"
            >
              Ir al CRM
            </Link>
            <Link
              href="/workspace/billing"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition"
            >
              Facturación
            </Link>
          </>
        )}
        <Link
          href="/workspace/inbox"
          className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]"
        >
          <Send className="w-4 h-4" /> Ir al Inbox
        </Link>
      </div>
    </section>
  )
}


