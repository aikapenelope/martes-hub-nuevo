'use client'

import React, { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'

import { HourlyHeatmap } from './HourlyHeatmap'
import type { HourBucket } from './overview/types'
import { Badge } from '@/components/ui/badge'
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DashboardCard } from '@/components/dashboard-card'
import { cn } from '@/lib/utils'

interface HeatmapDay {
  dateStr: string
  count: number
}

interface ActivityHeatmapProps {
  /** 364 días reales (52 semanas × 7 días), de más antiguo a más reciente. */
  daysData: HeatmapDay[]
  /** 168 celdas (7 días × 24 horas) — variante "por hora" (ítem 6 del sector UI). */
  hourBuckets: HourBucket[]
  totalInteractions: number
  className?: string
}

/** Nivel visual 0-4 según el conteo real del día, relativo al máximo del período. */
function levelFor(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

/**
 * Matriz de actividad estilo GitHub, alimentada exclusivamente con datos
 * reales (`activities`/`messages`/`payments` agregados por día en
 * `page.tsx`). No genera datos sintéticos: si no hay actividad registrada
 * en un día, la celda queda en nivel 0 — nunca se inventa una cifra.
 */
export function ActivityHeatmap({ daysData, hourBuckets, totalInteractions, className }: ActivityHeatmapProps) {
  const [hovered, setHovered] = useState<HeatmapDay | null>(null)
  const [view, setView] = useState<'year' | 'hours'>('year')
  const maxCount = useMemo(() => Math.max(...daysData.map((d) => d.count), 1), [daysData])

  const weeks = useMemo(() => {
    const result: HeatmapDay[][] = []
    for (let w = 0; w < daysData.length / 7; w++) {
      result.push(daysData.slice(w * 7, w * 7 + 7))
    }
    return result
  }, [daysData])

  return (
    <DashboardCard className={cn('col-span-1 md:col-span-2 lg:col-span-4 gap-0', className)}>
      <CardHeader className="border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0 py-3.5 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-400">
            <Activity className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">
              Matriz de Actividad Comercial (52 Semanas)
            </CardTitle>
            <CardDescription className="text-xs">
              Actividades, mensajes y pagos registrados por día del tenant activo
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle 52 semanas / por hora */}
          <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 border border-border/40">
            {(
              [
                { key: 'year', label: '52 Semanas' },
                { key: 'hours', label: 'Por Hora' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setView(opt.key)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  view === opt.key
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Badge variant="outline" className="text-xs font-medium">
            <strong className="text-foreground font-semibold mr-1">{totalInteractions}</strong>{' '}
            interacciones
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {totalInteractions === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Sin actividad registrada todavía en este período.
          </div>
        ) : view === 'hours' ? (
          <HourlyHeatmap hourBuckets={hourBuckets} totalInteractions={totalInteractions} />
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-[3px]" style={{ minWidth: weeks.length * 13 }}>
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <div
                      key={day.dateStr}
                      tabIndex={0}
                      role="img"
                      className={`heat-cell heat-${levelFor(day.count, maxCount)} cursor-pointer`}
                      onMouseEnter={() => setHovered(day)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(day)}
                      onBlur={() => setHovered(null)}
                      aria-label={`${day.count} interacciones el ${day.dateStr}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t py-2.5 px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
        <span>
          {hovered
            ? `${hovered.count} ${hovered.count !== 1 ? 'interacciones' : 'interacción'} · ${hovered.dateStr}`
            : 'Pasa el cursor sobre una celda para ver el detalle'}
        </span>
        <span className="flex items-center gap-1.5">
          <span>Menos</span>
          <span className="heat-cell heat-0 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-1 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-2 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-3 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-4 !w-2.5 !h-2.5" />
          <span>Más</span>
        </span>
      </CardFooter>
    </DashboardCard>
  )
}
