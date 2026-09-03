'use client'

import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Mail,
  MessageCircle,
  Radio,
  Webhook,
  XCircle,
} from 'lucide-react'
import type { SystemHealthSummary } from '@/lib/integrations-health'

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle2,
    badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    borderCls: 'border-emerald-950/60 hover:border-emerald-800/80',
    indicatorCls: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
  },
  warning: {
    icon: AlertTriangle,
    badgeCls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    borderCls: 'border-amber-950/60 hover:border-amber-800/80',
    indicatorCls: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]',
  },
  error: {
    icon: XCircle,
    badgeCls: 'bg-red-500/10 text-red-300 border-red-500/30',
    borderCls: 'border-red-950/60 hover:border-red-800/80',
    indicatorCls: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse',
  },
  disabled: {
    icon: Radio,
    badgeCls: 'bg-zinc-900 text-zinc-400 border-zinc-800',
    borderCls: 'border-zinc-900 hover:border-zinc-800',
    indicatorCls: 'bg-zinc-600',
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
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            Salud de Integraciones & Canales
          </h2>
          <p className="text-[11px] text-zinc-500 font-mono">
            Estado operativo de WhatsApp (OpenBSP), Resend, Google Calendar y Webhooks
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span
            className={`px-2 py-0.5 border font-bold uppercase ${
              overallStatus === 'healthy'
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/60'
                : overallStatus === 'warning'
                  ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                  : 'bg-red-950/50 text-red-300 border-red-800/60'
            }`}
          >
            {overallStatus === 'healthy'
              ? 'SISTEMA OPERATIVO AL 100%'
              : overallStatus === 'warning'
                ? 'ATENCIÓN REQUERIDA'
                : 'INCIDENTES DETECTADOS'}
          </span>
          {recentErrorCount > 0 && (
            <span className="text-red-400 font-bold border border-red-900/60 bg-red-950/30 px-1.5 py-0.5">
              {recentErrorCount} err / 24h
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 font-mono">
        {items.map((item) => {
          const cfg = STATUS_CONFIG[item.status]
          const CatIcon = CATEGORY_ICONS[item.category] || Activity

          return (
            <div
              key={item.id}
              className={`p-3 oled-subcard space-y-2 border transition ${cfg.borderCls}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-zinc-200 font-bold">
                  <CatIcon size={14} className="text-sky-400 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.indicatorCls}`} />
              </div>

              <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight">
                {item.message}
              </p>

              {item.detail && (
                <p className="text-[10px] text-zinc-500 truncate">
                  {item.detail}
                </p>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-zinc-900/80 text-[10px]">
                <span className={`px-1.5 py-0.2 border uppercase font-bold ${cfg.badgeCls}`}>
                  {item.badge}
                </span>

                {item.actionHref && item.actionLabel && (
                  <Link
                    href={item.actionHref}
                    className="text-sky-400 hover:text-sky-300 transition hover:underline"
                  >
                    {item.actionLabel} →
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
