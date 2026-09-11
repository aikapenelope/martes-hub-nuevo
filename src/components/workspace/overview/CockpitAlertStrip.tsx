import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { CockpitOperationalAlert } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CockpitAlertStripProps {
  alerts: CockpitOperationalAlert[]
}

export function CockpitAlertStrip({ alerts }: CockpitAlertStripProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-between border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="size-3.5" />
          </div>
          <span>
            <strong className="font-semibold text-foreground">Operación Comercial al 100%:</strong>{' '}
            <span className="text-muted-foreground">Sin alertas críticas activas. Ventanas de WhatsApp, cobros y tareas al día.</span>
          </span>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium">
          SLA Óptimo
        </Badge>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isCritical = alert.severity === 'critical'
        const Icon = isCritical ? ShieldAlert : AlertTriangle

        return (
          <div
            key={alert.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border px-4 py-3 text-xs transition ${
              isCritical
                ? 'border-destructive/30 bg-destructive/5 text-foreground'
                : 'border-amber-500/30 bg-amber-500/5 text-foreground'
            }`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  isCritical
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-amber-500/10 text-amber-500'
                }`}
              >
                <Icon className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{alert.title}</span>
                  {alert.badge && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${
                        isCritical
                          ? 'border-destructive/30 text-destructive'
                          : 'border-amber-500/30 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {alert.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.subtitle}</p>
              </div>
            </div>

            <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0 self-start sm:self-auto">
              <Link href={alert.href}>
                <span>{alert.actionText}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
