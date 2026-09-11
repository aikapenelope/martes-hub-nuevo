import Link from 'next/link'
import { Building2, Flame, MessageCircle, Sparkles } from 'lucide-react'
import type { Lead } from '@/payload-types'
import { Button } from '@/components/ui/button'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function CockpitPipelinePriorities({
  hotLeads,
  onOpenLead,
}: {
  hotLeads: Lead[]
  onOpenLead?: (leadId: number) => void
}) {
  return (
    <div className="p-3.5 bg-card text-card-foreground border border-border space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-border">
        <div>
          <h2 className="text-xs font-black text-foreground font-mono uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Prioridades del Pipeline
          </h2>
          <p className="text-[11px] text-muted-foreground">Leads calificados/contactados con movimiento más reciente</p>
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
            const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : null

            return (
              <div key={lead.id} className={`p-3 border border-border bg-muted/40 space-y-2 border-l-2 ${borderCls}`}>
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <strong className="text-foreground text-xs block truncate max-w-[180px]">{lead.fullName}</strong>
                    {lead.companyName && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                        <Building2 size={10} className="shrink-0 text-muted-foreground" />
                        {lead.companyName}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{lead.source}</span>
                      {cleanPhone ? (
                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
                          title="Escribir por WhatsApp"
                        >
                          <MessageCircle size={10} className="text-[#25d366]" />
                          +{cleanPhone}
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{lead.email ?? 'sin contacto'}</span>
                      )}
                    </div>
                  </div>
                  {typeof lead.estimatedValue === 'number' && (
                    <span className="text-amber-400 font-bold shrink-0 text-xs">
                      {currency.format(lead.estimatedValue)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-foreground/80 line-clamp-2">
                  {lead.notes ?? 'Sin notas registradas.'}
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-border">
                  <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> {actionLabel}
                  </span>
                  {onOpenLead ? (
                    <Button
                      type="button"
                      onClick={() => onOpenLead(lead.id)}
                      className="h-auto gap-1 rounded-none bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-foreground transition hover:bg-accent"
                    >
                      Abrir →
                    </Button>
                  ) : (
                    <Link
                      href={`/workspace/crm/leads/${lead.id}`}
                      className="px-2 py-0.5 bg-muted hover:bg-accent text-foreground text-[10px] uppercase font-bold transition inline-flex items-center gap-1"
                    >
                      Abrir →
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="p-6 text-center text-muted-foreground font-mono text-xs">
            No hay leads calificados o contactados en este momento.
          </div>
        )}
      </div>
    </div>
  )
}
