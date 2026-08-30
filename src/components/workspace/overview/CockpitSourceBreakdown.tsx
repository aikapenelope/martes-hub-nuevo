import { Compass, MapPin, MessageCircle, Camera, Globe, Users2, Share2, UserPlus } from 'lucide-react'
import type { ChannelSourceMetric } from './types'

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
      <div className="border border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-500 font-mono">
        Sin prospectos registrados aún para analizar canales de captación.
      </div>
    )
  }

  const totalLeads = sources.reduce((acc, s) => acc + s.count, 0)

  return (
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-sky-400" /> Canales de Captación
          </h2>
          <p className="text-[11px] text-zinc-500">Distribución de prospectos por canal de origen</p>
        </div>
        <span className="font-mono text-[10px] text-zinc-400 border border-zinc-800 px-2 py-0.5 font-bold">
          {totalLeads} {totalLeads === 1 ? 'Lead' : 'Leads'}
        </span>
      </div>

      <div className="space-y-2.5 font-mono text-xs">
        {sources.slice(0, 5).map((item) => {
          const Icon = SOURCE_ICONS[item.source] || Compass
          return (
            <div key={item.source} className="p-2.5 oled-subcard space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                  <Icon className="w-3.5 h-3.5 text-sky-400" />
                  {item.label}
                </span>
                <span className="text-[11px] text-zinc-400">
                  <strong className="text-white font-bold">{item.count}</strong> ({item.percentage}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-500"
                  style={{ width: `${Math.max(4, item.percentage)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
