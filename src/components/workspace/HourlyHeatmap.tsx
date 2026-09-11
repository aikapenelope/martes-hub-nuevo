'use client'

import React, { useMemo, useState } from 'react'

import type { HourBucket } from './overview/types'

interface HourlyHeatmapProps {
  /** 168 celdas (7 días × 24 horas) de actividad real del último año. */
  hourBuckets: HourBucket[]
  totalInteractions: number
}

/** Nivel visual 0-4 según el conteo de la celda, relativo al máximo de la matriz. */
function levelFor(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Variante horaria del heatmap anual (ítem 6 del sector UI): actividad por
 * hora del día × día de la semana, con las mismas celdas y niveles del
 * original. Alimentada exclusivamente con datos reales — sin datos, nivel 0.
 */
export function HourlyHeatmap({ hourBuckets, totalInteractions }: HourlyHeatmapProps) {
  const [hovered, setHovered] = useState<HourBucket | null>(null)

  const maxCount = useMemo(() => Math.max(...hourBuckets.map((b) => b.count), 1), [hourBuckets])

  // Indexa por `dow*24+hour` para ubicar cada celda en O(1)
  const byKey = useMemo(() => {
    const map = new Map<number, HourBucket>()
    for (const b of hourBuckets) map.set(b.dow * 24 + b.hour, b)
    return map
  }, [hourBuckets])

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-[3px] min-w-max">
        {/* Encabezado: días de la semana */}
        <div className="flex gap-[3px] items-end">
          <span className="w-7 shrink-0 text-right text-[8px] font-mono text-muted-foreground/60" aria-hidden="true" />
          {DOW_LABELS.map((d) => (
            <span key={d} className="w-10 text-center text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              {d}
            </span>
          ))}
        </div>

        {/* Filas: horas 0-23 */}
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className="flex gap-[3px] items-center">
            <span
              className="w-7 shrink-0 text-right text-[8px] font-mono text-muted-foreground/60"
              aria-hidden={hour % 3 !== 0}
            >
              {hour % 3 === 0 ? `${String(hour).padStart(2, '0')}h` : ''}
            </span>
            {DOW_LABELS.map((_, dow) => {
              const cell = byKey.get(dow * 24 + hour) ?? { dow, hour, count: 0 }
              return (
                <div
                  key={`${dow}-${hour}`}
                  tabIndex={0}
                  role="img"
                  className={`heat-cell heat-${levelFor(cell.count, maxCount)} cursor-pointer`}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(cell)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${cell.count} interacciones los ${DOW_LABELS[dow]} a las ${String(hour).padStart(2, '0')}:00`}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <span>
          {hovered
            ? `${hovered.count} ${hovered.count !== 1 ? 'interacciones' : 'interacción'} · ${DOW_LABELS[hovered.dow]} ${String(hovered.hour).padStart(2, '0')}:00`
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
      </div>
      <span className="sr-only">{totalInteractions} interacciones en el período</span>
    </div>
  )
}
