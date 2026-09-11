import Link from 'next/link'
import { Bot, Camera, ChevronRight, Compass, Globe, MapPin, MessageCircle, PhoneCall, Share2, UserPlus, Users2 } from 'lucide-react'
import type { ChannelSourceMetric } from './types'
import { MonoDonutChart, MONO_PALETTE } from '@/components/workspace/monocharts'
import { Badge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'
import { cn } from '@/lib/utils'

interface CockpitSourceBreakdownProps {
  sources: ChannelSourceMetric[]
  className?: string
}

const SOURCE_ICONS: Record<string, typeof Compass> = {
  google_maps: MapPin,
  puerta_fria: Compass,
  llamada_fria: PhoneCall,
  whatsapp: MessageCircle,
  instagram_dm: Camera,
  tally: Globe,
  apify: Bot,
  referido: Users2,
  linkedin: Share2,
  manual: UserPlus,
}

export function CockpitSourceBreakdown({ sources, className }: CockpitSourceBreakdownProps) {
  if (sources.length === 0) {
    return (
      <DashboardCard className={cn('col-span-1 md:col-span-2 lg:col-span-2 gap-0', className)}>
        <CardContent className="p-8 text-center text-xs text-muted-foreground">
          Sin prospectos registrados aún para analizar canales de captación.
        </CardContent>
      </DashboardCard>
    )
  }

  const totalLeads = sources.reduce((acc, s) => acc + s.count, 0)
  const donutData = sources.slice(0, 5).map((s, i) => ({
    label: s.label,
    value: s.count,
    color: MONO_PALETTE[i % MONO_PALETTE.length],
  }))

  return (
    <DashboardCard className={cn('col-span-1 md:col-span-2 lg:col-span-2 gap-0', className)}>
      <CardHeader className="border-b flex flex-row items-center justify-between space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-400">
            <Compass className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Canales de Captación</CardTitle>
            <CardDescription className="text-xs">Distribución de prospectos por origen</CardDescription>
          </div>
        </div>

        <Badge variant="outline" className="text-xs font-medium">
          {totalLeads} {totalLeads === 1 ? 'Lead' : 'Leads'}
        </Badge>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {/* Mini Donut */}
        <div className="py-1">
          <MonoDonutChart data={donutData} centerLabel="LEADS" innerRadius={36} outerRadius={48} />
        </div>

        <div className="divide-y divide-border/60 border-t border-border pt-2">
          {sources.slice(0, 5).map((item) => {
            const Icon = SOURCE_ICONS[item.source] || Compass
            return (
              <Link
                key={item.source}
                href={`/workspace/crm?vista=leads&modo=tabla&fuente=${item.source}`}
                className="block py-2.5 px-1 space-y-1.5 hover:bg-muted/30 transition-colors group rounded-md"
                title={`Ver leads captados por ${item.label}`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <Icon className="size-3.5 text-sky-400" />
                    <span>{item.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <strong className="text-foreground font-semibold tabular-nums">{item.count}</strong>
                    <span className="text-muted-foreground">{item.percentage}%</span>
                    <ChevronRight className="size-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                  </span>
                </div>
                {/* Barra punteada (dashed) estilo dashboard-9 "Traffic sources" */}
                <div
                  className="h-1.5 transition-all duration-500 group-hover:opacity-80 rounded-full"
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
      </CardContent>
    </DashboardCard>
  )
}

