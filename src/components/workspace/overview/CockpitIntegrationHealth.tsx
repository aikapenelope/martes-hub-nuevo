'use client'

import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Mail,
  MessageCircle,
  Radio,
  Webhook,
  XCircle,
} from 'lucide-react'
import type { SystemHealthSummary } from '@/lib/integrations-health'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle2,
    badgeVariant: 'success' as const,
    indicatorCls: 'bg-emerald-500 ring-2 ring-emerald-500/20',
  },
  warning: {
    icon: AlertTriangle,
    badgeVariant: 'warning' as const,
    indicatorCls: 'bg-amber-500 ring-2 ring-amber-500/20',
  },
  error: {
    icon: XCircle,
    badgeVariant: 'destructive' as const,
    indicatorCls: 'bg-destructive ring-2 ring-destructive/20 animate-pulse',
  },
  disabled: {
    icon: Radio,
    badgeVariant: 'outline' as const,
    indicatorCls: 'bg-muted-foreground/40',
  },
}

const CATEGORY_ICONS = {
  whatsapp: MessageCircle,
  email: Mail,
  calendar: Calendar,
  webhooks: Webhook,
}

export function CockpitIntegrationHealth({ health }: { health: SystemHealthSummary }) {
  const { items, overallStatus, recentErrorCount } = health

  return (
    <DashboardCard className="gap-0">
      <CardHeader className="border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-400">
            <Radio className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              Salud de Integraciones & Canales
            </CardTitle>
            <CardDescription className="text-xs">
              Estado operativo de WhatsApp, Resend, Google Calendar y Webhooks
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={
              overallStatus === 'healthy'
                ? 'success'
                : overallStatus === 'warning'
                ? 'warning'
                : overallStatus === 'disabled'
                ? 'outline'
                : 'destructive'
            }
            className="text-[11px] font-medium"
          >
            {overallStatus === 'healthy'
              ? 'Sistema 100% Operativo'
              : overallStatus === 'warning'
              ? 'Atención Requerida'
              : overallStatus === 'disabled'
              ? 'Configuración Incompleta'
              : 'Incidentes Detectados'}
          </Badge>
          {recentErrorCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {recentErrorCount} err / 24h
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-border p-px">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status]
            const CatIcon = CATEGORY_ICONS[item.category] || Activity

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between bg-background p-4 space-y-3 transition-colors hover:bg-muted/30"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <CatIcon className="size-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className={`size-2 rounded-full shrink-0 ${cfg.indicatorCls}`} />
                  </div>

                  <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                    {item.message}
                  </p>

                  {item.detail && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.detail}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <Badge variant={cfg.badgeVariant} className="text-[10px] uppercase font-medium">
                    {item.badge}
                  </Badge>

                  {item.actionHref && item.actionLabel && (
                    <Button asChild variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Link href={item.actionHref} className="flex items-center gap-1">
                        <span>{item.actionLabel}</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </DashboardCard>
  )
}
