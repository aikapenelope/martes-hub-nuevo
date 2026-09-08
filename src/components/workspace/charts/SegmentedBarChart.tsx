import type { WeeklyCashflow } from '@/lib/trend-widgets'

/**
 * Chart segmentado de cobranza (visual dashboard-9, adaptado al sistema OLED):
 * columnas HTML/CSS con utility classes de Tailwind — una por semana,
 * segmentos apilados blanco = Cobrado, gris = Pendiente. A diferencia del SVG
 * anterior, el layout no se distorsiona con el ancho del contenedor y las
 * semanas sin movimiento muestran su track vacío (honestidad visual con datos
 * chicos o vacíos).
 *
 * Server-renderable: sin estado ni handlers; el detalle de cada semana viaja
 * en el atributo title.
 *
 * Medidas del sistema (12 segmentos × h-1.5 + gap 3px → pista de h-[105px]):
 * constantes de diseño expresadas como utility classes, no inline styles.
 */

const MES: Record<string, string> = {
  '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic',
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

/** Segmentos de una semana: pendiente arriba, cobrado en la base. */
function WeekSegments({ cobrado, pendiente }: { cobrado: number; pendiente: number }) {
  if (cobrado + pendiente <= 0) {
    return <div className="h-full rounded-[2px] border border-dashed border-zinc-900" aria-hidden="true" />
  }
  const segments: React.ReactNode[] = []
  for (let k = 0; k < pendiente; k++) {
    segments.push(<i key={`p${k}`} className="block h-1.5 rounded-[2px] bg-zinc-600" />)
  }
  for (let k = 0; k < cobrado; k++) {
    segments.push(<i key={`c${k}`} className="block h-1.5 rounded-[2px] bg-white" />)
  }
  return <>{segments}</>
}

/**
 * Reparte los 12 segmentos de la pista entre las dos series. El total de
 * segmentos ∝ (cobrado + pendiente) / máximo de la serie; dentro de la
 * columna cada serie conserva su proporción, con mínimo 1 segmento cuando el
 * valor existe para que los montos chicos sigan siendo visibles.
 */
function splitSegments(
  cobrado: number,
  pendiente: number,
  maxTotal: number,
): { cobrado: number; pendiente: number } {
  const total = cobrado + pendiente
  if (total <= 0 || maxTotal <= 0) return { cobrado: 0, pendiente: 0 }
  const totalSegs = Math.max(1, Math.round((total / maxTotal) * 12))
  const cobradoSegs = cobrado > 0 ? Math.max(1, Math.round((cobrado / total) * totalSegs)) : 0
  const pendienteSegs =
    pendiente > 0 ? Math.max(1, Math.min(totalSegs - cobradoSegs, Math.round((pendiente / total) * totalSegs))) : 0
  return { cobrado: cobradoSegs, pendiente: pendienteSegs }
}

export function SegmentedBarChart({ weekStarts, cobrado, pendiente }: WeeklyCashflow) {
  const maxTotal = Math.max(...cobrado.map((c, i) => c + (pendiente[i] ?? 0)), 1)

  return (
    <div
      className="grid grid-cols-8 gap-3"
      role="img"
      aria-label="Cobranza semanal de las últimas 8 semanas: cobrado versus pendiente"
    >
      {weekStarts.map((weekStart, i) => {
        const c = cobrado[i] ?? 0
        const p = pendiente[i] ?? 0
        const { cobrado: cSegs, pendiente: pSegs } = splitSegments(c, p, maxTotal)

        const [, month, day] = weekStart.split('-')
        const monthChanged = i === 0 || month !== weekStarts[i - 1].slice(5, 7)
        const label = monthChanged ? `${Number(day)} ${MES[month] ?? ''}` : String(Number(day))

        return (
          <div
            key={weekStart}
            className="flex flex-col"
            title={`Semana del ${Number(day)} ${MES[month] ?? ''} · Cobrado ${fmtMoney(c)} · Pendiente ${fmtMoney(p)}`}
          >
            {/* Pista fija h-[105px]: 12 segmentos h-1.5 con gap-[3px] */}
            <div className="flex h-[105px] flex-col justify-end gap-[3px]">
              <WeekSegments cobrado={cSegs} pendiente={pSegs} />
            </div>
            <div className="mt-1.5 text-center text-[8px] font-mono text-zinc-600">{label}</div>
          </div>
        )
      })}
    </div>
  )
}
