import { CheckCircle2, MailCheck, MessageCircle, Sparkles } from 'lucide-react'
import type { Client, Conversation, ConversationSummary, EmailLog, Payment } from '@/payload-types'
import { formatTimeAgo } from '@/lib/crm-pipeline-window'

const currency = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function CockpitOmnichannelFeed({
  conversations,
  summaries,
  emails,
  payments,
  nowTime,
}: {
  conversations: Conversation[]
  summaries: ConversationSummary[]
  emails: EmailLog[]
  payments: Payment[]
  nowTime: number
}) {
  const latestConv = conversations[0]
  const latestSummary = summaries[0]
  const latestEmail = emails[0]
  const latestPayment = payments[0]

  return (
    <div className="p-4 oled-card space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div>
          <h2 className="text-xs font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 bg-sky-400 pulse-glow inline-block" /> Feed Omnicanal
          </h2>
          <p className="text-[11px] text-zinc-500">Últimos eventos de WhatsApp, IA, email y cobros</p>
        </div>
      </div>

      <div className="space-y-2.5 font-mono text-xs">
        {latestConv && (
          <div className="p-3 oled-subcard space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sky-400 font-bold flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp / Instagram
              </span>
              <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestConv.updatedAt, nowTime)}</span>
            </div>
            <p className="text-zinc-200 text-xs truncate">Interacción activa con {latestConv.contactAddress}</p>
            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>Canal: {latestConv.channel}</span>
            </div>
          </div>
        )}

        {latestSummary && (
          <div className="p-3 oled-subcard space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Resumen IA Generado
              </span>
              <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestSummary.createdAt, nowTime)}</span>
            </div>
            <p className="text-zinc-200 text-xs truncate">{latestSummary.summary}</p>
            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>Sentimiento: {latestSummary.sentiment}</span>
            </div>
          </div>
        )}

        {latestEmail && (
          <div className="p-3 oled-subcard space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                <MailCheck className="w-3.5 h-3.5" /> Email (Resend)
              </span>
              <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestEmail.createdAt, nowTime)}</span>
            </div>
            <p className="text-zinc-200 text-xs truncate">{latestEmail.subject}</p>
            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>{latestEmail.to}</span>
            </div>
          </div>
        )}

        {latestPayment && (
          <div className="p-3 oled-subcard space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pago Confirmado
              </span>
              <span className="text-[10px] text-zinc-500">{formatTimeAgo(latestPayment.createdAt, nowTime)}</span>
            </div>
            <p className="text-zinc-200 text-xs truncate">
              {currency.format(Number(latestPayment.amount))} · {latestPayment.concept || 'Cobro'}
            </p>
            <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
              <span>
                Cliente:{' '}
                {typeof latestPayment.client === 'object' && latestPayment.client !== null
                  ? (latestPayment.client as Client).name
                  : 'Sin cliente vinculado'}
              </span>
            </div>
          </div>
        )}

        {!latestConv && !latestSummary && !latestEmail && !latestPayment && (
          <div className="p-6 text-center text-zinc-500 font-mono text-xs">
            Sin actividad reciente registrada todavía.
          </div>
        )}
      </div>
    </div>
  )
}
