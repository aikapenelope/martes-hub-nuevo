import Link from 'next/link'
import { ArrowRight, Clock, MessageCircle, PhoneCall, UserRound } from 'lucide-react'
import type { FollowUpItem } from '@/lib/followups-today'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'
import { cn } from '@/lib/utils'

const PIPELINE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  cliente_nuevo: 'Cliente nuevo',
  cliente_activo: 'Cliente activo',
  cliente_inactivo: 'Cliente inactivo',
}

const MAX_SHOWN = 4

/**
 * Strip de seguimientos del día: reutiliza el criterio de negocio de
 * /api/followups/hoy (SLA por etapa + ventana 24h) ya calculado en el
 * servidor. Cada tarjeta ofrece el contacto directo por WhatsApp y el
 * acceso a la ficha del CRM.
 */
export function CockpitFollowupsToday({
  items,
  onOpenLead,
  className,
}: {
  items: FollowUpItem[]
  onOpenLead?: (leadId: number) => void
  className?: string
}) {
  const shown = items.slice(0, MAX_SHOWN)
  const extra = items.length - shown.length

  return (
    <DashboardCard className={cn('col-span-1 md:col-span-2 lg:col-span-2 gap-0', className)}>
      <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
            <PhoneCall className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Seguimientos de Hoy</CardTitle>
            <CardDescription className="text-xs">Contactos que requieren atención según SLA</CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={items.length > 0 ? 'warning' : 'success'}
            className="text-[11px] font-medium"
          >
            {items.length > 0 ? `${items.length} por contactar` : 'Al día'}
          </Badge>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
            <Link href="/workspace/hoy" className="flex items-center gap-1">
              <span>Agenda</span>
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {shown.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-border p-px">
            {shown.map((item) => (
              <div
                key={`${item.kind}:${item.id}`}
                className="flex flex-col justify-between bg-background p-4 space-y-3 transition-colors hover:bg-muted/30"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm font-medium text-foreground truncate block">
                      {item.name}
                    </strong>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 font-medium ${
                        item.reason === 'Nunca contactado'
                          ? 'border-amber-500/30 text-amber-500 bg-amber-500/5'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {item.reason === 'Nunca contactado' ? 'Nuevo' : `${item.daysSince}d`}
                    </Badge>
                  </div>

                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserRound className="size-3 text-muted-foreground/70 shrink-0" />
                    <span>{PIPELINE_LABELS[item.pipeline] ?? item.pipeline}</span>
                  </span>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <Clock className="size-3 text-muted-foreground/70 shrink-0" />
                    <span className="truncate">{item.reason}</span>
                  </p>
                </div>

                <div className="flex items-center gap-1.5 pt-2 border-t border-border/40">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500 gap-1.5"
                  >
                    <a
                      href={item.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="size-3.5 text-emerald-500" />
                      <span>WhatsApp</span>
                    </a>
                  </Button>

                  {item.kind === 'lead' && onOpenLead ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenLead(item.id)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Ficha <ArrowRight className="size-3 ml-0.5" />
                    </Button>
                  ) : (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Link href={item.crmUrl}>
                        Ficha <ArrowRight className="size-3 ml-0.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Nadie supera su SLA de contacto hoy. Operación al día.
          </div>
        )}
      </CardContent>

      {extra > 0 && (
        <div className="px-4 py-2 border-t border-border/50 text-right bg-muted/20">
          <Link
            href="/workspace/hoy"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 font-medium"
          >
            <span>+{extra} más en la agenda de hoy</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      )}
    </DashboardCard>
  )
}
