import type { WeeklyCashflow } from '@/lib/trend-widgets'

/**
 * Chart segmentado de cobranza (visual icónico de la referencia dashboard-9,
 * adaptado al sistema OLED con SVG puro — sin shadcn/Recharts, mismo camino
 * que TrendStrip): barras verticales apiladas de segmentos redondeados,
 * blanco = Cobrado, gris = Pendiente. Server-renderable: sin estado ni
 * handlers, el detalle de cada barra viaja en el <title> nativo del SVG.
 */

const SEGMENT_H = 7
const SEGMENT_GAP = 3
const STEP = SEGMENT_H + SEGMENT_GAP
const MAX_SEGMENTS = 16
const BAR_W = 26
const BAR_GAP = 14
const PAD_X = 2
const CHART_H = MAX_SEGMENTS * STEP - SEGMENT_GAP
const LABEL_H = 16

const COBRADO_FILL = '#ffffff'
const PENDIENTE_FILL = '#52525b'

const MES: Record<string, string> = {
  '01': 'ene', '02': 'feb', '03': 'mar', '04': 'abr', '05': 'may', '06': 'jun',
  '07': 'jul', '08': 'ago', '09': 'sep', '10': 'oct', '11': 'nov', '12': 'dic',
}

function fmtMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

/**
 * Reparte el alto de una barra (en segmentos) entre las dos series. El total
 * de segmentos ∝ (cobrado + pendiente) / máximo de la serie; dentro de la
 * barra cada serie conserva su proporción, con mínimo 1 segmento cuando el
 * valor existe para que los montos chicos sigan siendo visibles.
 */
function splitSegments(
  cobrado: number,
  pendiente: number,
  maxTotal: number,
): { cobrado: number; pendiente: number } {
  const total = cobrado + pendiente
  if (total <= 0 || maxTotal <= 0) return { cobrado: 0, pendiente: 0 }
  const totalSegs = Math.max(1, Math.round((total / maxTotal) * MAX_SEGMENTS))
  const cobradoSegs = cobrado > 0 ? Math.max(1, Math.round((cobrado / total) * totalSegs)) : 0
  let pendienteSegs = pendiente > 0 ? Math.max(1, Math.round((pendiente / total) * totalSegs)) : 0
  if (cobradoSegs + pendienteSegs > totalSegs) {
    pendienteSegs = Math.max(1, totalSegs - cobradoSegs)
  }
  return { cobrado: cobradoSegs, pendiente: pendienteSegs }
}

export function SegmentedBarChart({ weekStarts, cobrado, pendiente }: WeeklyCashflow) {
  const n = weekStarts.length
  const width = PAD_X * 2 + n * BAR_W + (n - 1) * BAR_GAP
  const maxTotal = Math.max(...cobrado.map((c, i) => c + (pendiente[i] ?? 0)), 1)

  return (
    <svg
      viewBox={`0 0 ${width} ${CHART_H + LABEL_H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Cobranza semanal de las últimas 8 semanas: cobrado versus pendiente"
    >
      {weekStarts.map((weekStart, i) => {
        const x = PAD_X + i * (BAR_W + BAR_GAP)
        const segs = splitSegments(cobrado[i] ?? 0, pendiente[i] ?? 0, maxTotal)

        // Etiqueta: día del lunes; se añade el mes cuando cambia respecto de la barra anterior.
        const [, month, day] = weekStart.split('-')
        const monthChanged = i === 0 || weekStart.slice(5, 7) !== weekStarts[i - 1].slice(5, 7)
        const label = monthChanged ? `${Number(day)} ${MES[month] ?? ''}` : String(Number(day))

        const segments = [] as React.ReactNode[]
        for (let k = 0; k < segs.cobrado + segs.pendiente; k++) {
          const isCobrado = k < segs.cobrado
          segments.push(
            <rect
              key={k}
              x={x}
              y={CHART_H - (k + 1) * SEGMENT_H - k * SEGMENT_GAP}
              width={BAR_W}
              height={SEGMENT_H}
              rx={2}
              fill={isCobrado ? COBRADO_FILL : PENDIENTE_FILL}
            />,
          )
        }

        return (
          <g key={weekStart}>
            <title>
              {`Semana del ${Number(day)} ${MES[month] ?? ''} · Cobrado ${fmtMoney(cobrado[i] ?? 0)} · Pendiente ${fmtMoney(pendiente[i] ?? 0)}`}
            </title>
            {segments}
            <text
              x={x + BAR_W / 2}
              y={CHART_H + 12}
              textAnchor="middle"
              fontSize={8}
              fill="#71717a"
              fontFamily="var(--font-geist-mono, monospace)"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
