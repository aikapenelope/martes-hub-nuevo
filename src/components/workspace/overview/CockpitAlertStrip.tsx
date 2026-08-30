import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import type { CockpitOperationalAlert } from './types'

interface CockpitAlertStripProps {
  alerts: CockpitOperationalAlert[]
}

export function CockpitAlertStrip({ alerts }: CockpitAlertStripProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-between border border-emerald-950/60 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-300">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="font-semibold text-emerald-200">Operación Comercial al 100%:</strong> Sin alertas críticas activas. Ventanas de WhatsApp, cobros y tareas al día.
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase text-emerald-400/80 border border-emerald-800/60 px-2 py-0.5">
          SLA Óptimo
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isCritical = alert.severity === 'critical'
        const Icon = isCritical ? ShieldAlert : AlertTriangle
        const borderCls = isCritical
          ? 'border-red-900/60 bg-red-950/25 text-red-200'
          : 'border-amber-900/60 bg-amber-950/25 text-amber-200'
        const iconCls = isCritical ? 'text-red-400' : 'text-amber-400'
        const badgeCls = isCritical
          ? 'bg-red-950 border-red-800 text-red-300'
          : 'bg-amber-950 border-amber-800 text-amber-300'

        return (
          <div
            key={alert.id}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border px-4 py-3 text-xs transition ${borderCls}`}
          >
            <div className="flex items-start sm:items-center gap-3">
              <Icon className={`w-4 h-4 mt-0.5 sm:mt-0 shrink-0 ${iconCls}`} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white leading-tight">{alert.title}</span>
                  {alert.badge && (
                    <span className={`font-mono text-[9px] uppercase border px-1.5 py-0.2 ${badgeCls}`}>
                      {alert.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-300 mt-0.5 leading-snug">{alert.subtitle}</p>
              </div>
            </div>

            <Link
              href={alert.href}
              className="inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto font-mono text-[11px] font-bold text-white hover:underline uppercase tracking-wider bg-black/40 border border-zinc-800 px-3 py-1.5 transition hover:bg-black/80"
            >
              <span>{alert.actionText}</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )
      })}
    </div>
  )
}
