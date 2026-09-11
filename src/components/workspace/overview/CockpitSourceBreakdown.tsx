import Link from 'next/link'
import { Compass, MapPin, MessageCircle, Camera, Globe, Users2, Share2, UserPlus } from 'lucide-react'
import type { ChannelSourceMetric } from './types'
import { MonoDonutChart, MONO_PALETTE } from '@/components/workspace/monocharts'

interface CockpitSourceBreakdownProps {
  sources: ChannelSourceMetric[]
}

const SOURCE_ICONS: Record<string, typeof Compass> = {
  google_maps: MapPin,
  puerta_fria: Compass,
  whatsapp: MessageCircle,
  instagram_dm: Camera,
  tally: Globe,
  referido: Users2,
  linkedin: Share2,
  manual: UserPlus,
}

export function CockpitSourceBreakdown({ sources }: CockpitSourceBreakdownProps) {
  if (sources.length === 0) {
    return (
      <div className="border border-border bg-background p-4 text-center text-xs text-muted-foreground font-mono">
        Sin prospectos registrados aún para analizar canales de captación.
      </div>
    )
  }

  const totalLeads = sources.reduce((acc, s) => acc + s.count, 0)
  const donutData = sources.slice(0, 5).map((s, i) => ({
    label: s.label,
    value: s.count,
    color: MONO_PALETTE[i % MONO_PALETTE.length],
  }))

  return (
    <div className="p-3.5 bg-card text-card-foreground border border-border space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-border">
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-sky-400" /> Canales de Captación
          </h2>
          <p className="text-[11px] text-muted-foreground">Distribución de prospectos por canal de origen</p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground border border-border px-2 py-0.5 font-bold">
          {totalLeads} {totalLeads === 1 ? 'Lead' : 'Leads'}
        </span>
      </div>

      {/* Mini Donut Monocromático */}
      <div className="pt-1 pb-2">
        <MonoDonutChart data={donutData} centerLabel="LEADS" innerRadius={36} outerRadius={48} />
      </div>

      <div className="space-y-2 font-mono text-xs border-t border-border pt-2.5">
        {sources.slice(0, 5).map((item) => {
          const Icon = SOURCE_ICONS[item.source] || Compass
          return (
            <Link
              key={item.source}
              href={`/workspace/crm?vista=leads&modo=tabla&fuente=${item.source}`}
              className="block p-2.5 border border-border bg-muted/40 space-y-1.5 hover:border-muted-foreground/40 transition group"
              title={`Ver leads captados por ${item.label}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Icon className="w-3.5 h-3.5 text-sky-400" />
                  {item.label}
                </span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <strong className="text-foreground font-bold">{item.count}</strong>
                  <span className="text-muted-foreground">{item.percentage}%</span>
                  <span className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground/80 transition" aria-hidden="true">&gt;</span>
                </span>
              </div>
              {/* Barra punteada (dashed) estilo dashboard-9 "Traffic sources" */}
              <div
                className="h-1.5 transition-all duration-500 group-hover:opacity-80"
                role="img"
                aria-label={`${item.count} de ${totalLeads} leads (${item.percentage}%)`}
                style={{
                  width: `${Math.max(6, item.percentage)}%`,
                  backgroundImage:
                    'repeating-linear-gradient(to right, #ffffff 0, #ffffff 6px, transparent 6px, transparent 10px)',
                }}
              />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

