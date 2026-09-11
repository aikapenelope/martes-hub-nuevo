import Link from 'next/link'
import { ArrowRight, Building2, Flame, MessageCircle, Sparkles } from 'lucide-react'
import type { Lead } from '@/payload-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'

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
    <DashboardCard className="gap-0">
      <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-500">
            <Flame className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Prioridades del Pipeline</CardTitle>
            <CardDescription className="text-xs">Leads calificados con mayor potencial y actividad reciente</CardDescription>
          </div>
        </div>

        <Badge
          variant={hotLeads.length > 0 ? 'warning' : 'outline'}
          className="text-[11px] font-medium"
        >
          {hotLeads.length > 0 ? `${hotLeads.length} prioritarios` : 'Sin alertas'}
        </Badge>
      </CardHeader>

      <CardContent className="p-0">
        {hotLeads.length > 0 ? (
          <ul className="divide-y divide-border">
            {hotLeads.map((lead) => {
              const actionLabel = lead.status === 'calificado' ? 'Enviar cotización' : 'Agendar seguimiento'
              const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : null

              return (
                <li
                  key={lead.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm font-medium text-foreground truncate">
                        {lead.fullName}
                      </strong>
                      {lead.companyName && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Building2 className="size-3 text-muted-foreground/70 shrink-0" />
                          {lead.companyName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                      <span className="capitalize">{lead.source}</span>
                      <span>·</span>
                      {cleanPhone ? (
                        <a
                          href={`https://wa.me/${cleanPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline"
                          title="Escribir por WhatsApp"
                        >
                          <MessageCircle className="size-3 text-emerald-500" />
                          +{cleanPhone}
                        </a>
                      ) : (
                        <span>{lead.email ?? 'Sin contacto'}</span>
                      )}
                    </div>

                    {lead.notes && (
                      <p className="text-xs text-muted-foreground/80 line-clamp-1 pt-0.5">
                        {lead.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    {typeof lead.estimatedValue === 'number' && (
                      <span className="font-semibold text-sm tabular-nums text-foreground">
                        {currency.format(lead.estimatedValue)}
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground hidden md:inline-flex items-center gap-1">
                        <Sparkles className="size-3 text-primary" /> {actionLabel}
                      </span>

                      {onOpenLead ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenLead(lead.id)}
                          className="h-7 text-xs gap-1"
                        >
                          <span>Ficha</span>
                          <ArrowRight className="size-3" />
                        </Button>
                      ) : (
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                          <Link href={`/workspace/crm/leads/${lead.id}`}>
                            <span>Ficha</span>
                            <ArrowRight className="size-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No hay leads calificados o contactados en este momento.
          </div>
        )}
      </CardContent>
    </DashboardCard>
  )
}
