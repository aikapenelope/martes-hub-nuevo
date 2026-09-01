import Link from 'next/link'
import { Flame, Sparkles } from 'lucide-react'
import type { Lead } from '@/payload-types'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function CockpitPipelinePriorities({ hotLeads }: { hotLeads: Lead[] }) {
  return (
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Prioridades del Pipeline
          </h2>
          <p className="text-[11px] text-zinc-500">Leads calificados/contactados con movimiento más reciente</p>
        </div>
        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20 font-bold">
          {hotLeads.length > 0 ? `${hotLeads.length} PRIORITARIOS` : 'SIN ALERTAS'}
        </span>
      </div>

      <div className="space-y-2.5 font-mono text-xs">
        {hotLeads.length > 0 ? (
          hotLeads.map((lead, idx) => {
            const borderColors = ['border-l-amber-400', 'border-l-sky-400', 'border-l-indigo-400']
            const borderCls = borderColors[idx % borderColors.length]
            const actionLabel = lead.status === 'calificado' ? 'Enviar cotización' : 'Agendar seguimiento'

            return (
              <div key={lead.id} className={`p-3 oled-subcard space-y-2 border-l-2 ${borderCls}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="text-white text-xs block truncate max-w-[180px]">{lead.fullName}</strong>
                    <span className="text-[10px] text-zinc-400">
                      {lead.source} · {lead.phone ?? lead.email ?? 'sin contacto registrado'}
                    </span>
                  </div>
                  {typeof lead.estimatedValue === 'number' && (
                    <span className="text-amber-400 font-bold shrink-0">
                      {currency.format(lead.estimatedValue)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-300 line-clamp-2">
                  {lead.notes ?? 'Sin notas registradas.'}
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900">
                  <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> {actionLabel}
                  </span>
                  <Link
                    href={`/workspace/crm/leads/${lead.id}`}
                    className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] uppercase font-bold transition inline-flex items-center gap-1"
                  >
                    Abrir →
                  </Link>
                </div>
              </div>
            )
          })
        ) : (
          <div className="p-6 text-center text-zinc-500 font-mono text-xs">
            No hay leads calificados o contactados en este momento.
          </div>
        )}
      </div>
    </div>
  )
}
