import Link from 'next/link'
import { ArrowRight, Clock, MessageCircle, PhoneCall, UserRound } from 'lucide-react'
import type { FollowUpItem } from '@/lib/followups-today'

const PIPELINE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  cliente_nuevo: 'Cliente nuevo',
  cliente_activo: 'Cliente activo',
  cliente_inactivo: 'Cliente inactivo',
}

const MAX_SHOWN = 4

/**
 * Strip de seguimientos del día: reutiliza el criterio de negocio de
 * /api/followups/hoy (SLA por etapa + ventana 24h) ya calculado en el
 * servidor. Cada tarjeta ofrece el contacto directo por WhatsApp y el
 * acceso a la ficha del CRM.
 */
export function CockpitFollowupsToday({
  items,
  onOpenLead,
}: {
  items: FollowUpItem[]
  onOpenLead?: (leadId: number) => void
}) {
  const shown = items.slice(0, MAX_SHOWN)
  const extra = items.length - shown.length

  return (
    <div className="p-4 oled-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> Seguimientos de Hoy
          </h2>
          <span
            className={`font-mono text-[10px] font-bold px-2 py-0.5 border ${
              items.length > 0
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60'
            }`}
          >
            {items.length > 0 ? `${items.length} POR CONTACTAR` : 'AL DÍA'}
          </span>
        </div>
        <Link
          href="/workspace/hoy"
          className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1 font-bold"
        >
          Agenda completa →
        </Link>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {shown.map((item) => (
            <div key={`${item.kind}:${item.id}`} className="p-3 oled-subcard space-y-2 border-l-2 border-l-emerald-400/80">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="text-white text-xs block truncate">{item.name}</strong>
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <UserRound className="w-3 h-3 shrink-0" />
                    {PIPELINE_LABELS[item.pipeline] ?? item.pipeline}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 border ${
                    item.reason === 'Nunca contactado'
                      ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800'
                  }`}
                >
                  {item.reason === 'Nunca contactado' ? 'NUEVO' : `${item.daysSince}d`}
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
                <Clock className="w-3 h-3 shrink-0 text-zinc-500" />
                {item.reason}
              </p>

              <div className="flex items-center gap-1.5 pt-1">
                <a
                  href={item.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-600/40 text-emerald-300 text-[10px] font-bold uppercase font-mono transition"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
                {item.kind === 'lead' && onOpenLead ? (
                  <button
                    type="button"
                    onClick={() => onOpenLead(item.id)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-[10px] font-bold uppercase font-mono transition"
                  >
                    Ficha <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <Link
                    href={item.crmUrl}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-[10px] font-bold uppercase font-mono transition"
                  >
                    Ficha <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3 text-center font-mono text-xs text-zinc-500">
          Nadie supera su SLA de contacto hoy. Operación al día.
        </div>
      )}

      {extra > 0 && (
        <p className="text-[11px] font-mono text-zinc-500 text-right">
          +{extra} más en la{' '}
          <Link href="/workspace/hoy" className="text-emerald-400 hover:underline font-bold">
            agenda de hoy
          </Link>
        </p>
      )}
    </div>
  )
}
