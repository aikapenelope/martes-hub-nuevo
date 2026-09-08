import { Target } from 'lucide-react'

import type { ConversionReportRow } from '@/lib/conversion-reports'

/**
 * Tabla de embudo entrada → contactado → calificado → cliente para un
 * desglose (origen o agente). Server component puro: sin estado ni JS.
 */

const STAGES: { key: 'contactado' | 'calificado' | 'cliente'; label: string }[] = [
  { key: 'contactado', label: 'Contactados' },
  { key: 'calificado', label: 'Calificados' },
  { key: 'cliente', label: 'Clientes' },
]

function ConversionBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <span className="relative block h-1.5 w-full max-w-32 overflow-hidden bg-zinc-800" aria-hidden="true">
      <span className="absolute inset-y-0 left-0 bg-sky-400/80" style={{ width: `${pct}%` }} />
    </span>
  )
}

export function ConversionReportTable({
  eyebrow,
  title,
  rows,
}: {
  eyebrow: string
  title: string
  rows: ConversionReportRow[]
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{eyebrow}</h3>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-zinc-500">Sin datos para este desglose.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-2 pr-3 font-medium">{title}</th>
                <th className="px-3 py-2 text-right font-medium">Entrada</th>
                <th className="px-3 py-2 text-right font-medium">Contactados</th>
                <th className="px-3 py-2 text-right font-medium">Calificados</th>
                <th className="px-3 py-2 text-right font-medium">Clientes</th>
                <th className="py-2 pl-3 font-medium">Conversión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {rows.map((row) => (
                <tr key={row.key} className="text-zinc-300">
                  <td className="max-w-40 truncate py-2.5 pr-3 font-medium text-white">{row.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{row.entrada}</td>
                  {STAGES.map((stage) => (
                    <td key={stage.key} className="px-3 py-2.5 text-right font-mono">
                      <span className="block">{row[stage.key]}</span>
                      <ConversionBar value={row[stage.key]} total={row.entrada} />
                    </td>
                  ))}
                  <td className="py-2.5 pl-3 font-mono font-bold text-sky-300">{row.conversionPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            Contactados/Calificados = leads que alcanzaron la etapa (según estado actual o conversión). Descartados cuentan solo como entrada.
          </p>
        </div>
      )}
    </section>
  )
}
