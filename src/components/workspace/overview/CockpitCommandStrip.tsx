import Link from 'next/link'
import { Send } from 'lucide-react'
import type { Client, Tenant } from '@/payload-types'
import { CrmFormDialog } from '@/components/workspace/CrmFormDialog'
import { PaymentCreateDialog } from '@/components/workspace/PaymentCreateDialog'

interface CockpitCommandStripProps {
  tenant: Tenant
  dateTitle: string
  canEdit: boolean
  clients: Client[]
}

/**
 * Accesos rápidos del cockpit. Con permiso de edición, "+ Lead" y
 * "+ Cobro" abren dialogs con Server Actions reales (sin salir del
 * dashboard); para viewers quedan como enlaces de solo lectura.
 */
export function CockpitCommandStrip({
  tenant,
  dateTitle,
  canEdit,
  clients,
}: CockpitCommandStripProps) {
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

      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
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

