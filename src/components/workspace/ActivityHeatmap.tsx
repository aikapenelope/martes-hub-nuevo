'use client'

import React, { useMemo, useState } from 'react'

interface HeatmapDay {
  dateStr: string
  count: number
}

interface ActivityHeatmapProps {
  /** 364 días reales (52 semanas × 7 días), de más antiguo a más reciente. */
  daysData: HeatmapDay[]
  totalInteractions: number
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
export function ActivityHeatmap({ daysData, totalInteractions }: ActivityHeatmapProps) {
  const [hovered, setHovered] = useState<HeatmapDay | null>(null)
  const maxCount = useMemo(() => Math.max(...daysData.map((d) => d.count), 1), [daysData])

  const weeks = useMemo(() => {
    const result: HeatmapDay[][] = []
    for (let w = 0; w < daysData.length / 7; w++) {
      result.push(daysData.slice(w * 7, w * 7 + 7))
    }
    return result
  }, [daysData])

  return (
    <div className="p-4 oled-card space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-black text-white flex items-center gap-2 font-mono uppercase tracking-wider">
              <span className="w-2.5 h-2.5 bg-sky-400 inline-block shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
              Matriz de Actividad Comercial (52 Semanas)
            </h2>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Actividades, mensajes y pagos registrados por día del tenant activo
          </p>
        </div>
        <span className="text-xs font-mono text-zinc-400">
          <strong className="text-white">{totalInteractions}</strong> interacciones en el período
        </span>
      </div>

      {totalInteractions === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500 font-mono">
          Sin actividad registrada todavía en este período.
        </div>
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

      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
        <span>
          {hovered
            ? `${hovered.count} interacción${hovered.count !== 1 ? 'es' : ''} · ${hovered.dateStr}`
            : 'Pasa el cursor sobre una celda para ver el detalle'}
        </span>
        <span className="flex items-center gap-1">
          Menos
          <span className="heat-cell heat-0 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-1 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-2 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-3 !w-2.5 !h-2.5" />
          <span className="heat-cell heat-4 !w-2.5 !h-2.5" />
          Más
        </span>
      </div>
    </div>
  )
}
