import 'server-only'

import Link from 'next/link'
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

import { getUpcomingAgenda } from '@/lib/agenda-data'
import { collectFollowupsToday } from '@/lib/followups-today'
import { getWorkspaceContext } from '@/lib/workspace-context'

export default async function HoyPage() {
  const context = await getWorkspaceContext()

  // Obtener zona horaria configurada para el tenant activo
  const settingsRes = await context.payload.find({
    collection: 'company-settings',
    where: { tenant: { equals: context.tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const timeZone = settingsRes.docs[0]?.timezone || 'America/Caracas'

  const now = new Date()
  let isoDateStr = ''
  try {
    isoDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    isoDateStr = now.toISOString().slice(0, 10)
  }

  const startOfToday = new Date(`${isoDateStr}T00:00:00Z`)

  const [agendaItems, followups] = await Promise.all([
    getUpcomingAgenda({
      payload: context.payload,
      tenantId: context.tenantId,
      user: context.user,
      days: 1,
      since: startOfToday,
    }),
    collectFollowupsToday({
      payload: context.payload,
      user: context.user,
      tenantId: context.tenantId,
    }),
  ])

  const appointments = agendaItems.filter((i) => i.type === 'cita')
  const tasks = agendaItems.filter((i) => i.type === 'task')
  const payments = agendaItems.filter((i) => i.type === 'payment')
  const totalCommitments = appointments.length + tasks.length + payments.length

  let todayDateFormatted = ''
  try {
    todayDateFormatted = new Intl.DateTimeFormat('es', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now)
  } catch {
    todayDateFormatted = new Intl.DateTimeFormat('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now)
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-emerald-400 inline-block animate-pulse" />
              <span>Briefing Diario · {context.tenant.name}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white capitalize">
              {todayDateFormatted}
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Centro de operaciones del día: compromisos agendados, tareas pendientes y seguimientos prioritarios.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workspace/hoy"
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Actualizar
            </Link>
          </div>
        </div>
      </section>

      {/* KPI Cards Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="oled-card p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-sky-400" /> Citas hoy
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{appointments.length}</p>
        </div>
        <div className="oled-card p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <CheckSquare className="w-4 h-4 text-amber-400" /> Tareas hoy
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{tasks.length}</p>
        </div>
        <div className="oled-card p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <CreditCard className="w-4 h-4 text-emerald-400" /> Cobros hoy
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{payments.length}</p>
        </div>
        <div className="oled-card p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
            <MessageCircle className="w-4 h-4 text-[#25d366]" /> A contactar
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{followups.length}</p>
        </div>
      </section>

      {/* Main Grid: Agenda & Followups */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agenda del Día */}
        <div className="space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-white" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Agenda del Día
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {totalCommitments} {totalCommitments === 1 ? 'compromiso' : 'compromisos'}
              </span>
            </div>

            {totalCommitments === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-sm font-medium text-zinc-300">Agenda despejada para hoy</p>
                <p className="text-xs font-mono mt-1 text-zinc-500">
                  No hay citas ni tareas programadas con vencimiento hoy.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-zinc-900">
                {appointments.length > 0 && (
                  <div className="py-3 first:pt-0">
                    <p className="text-[10px] font-mono text-sky-400 uppercase tracking-wider mb-2">
                      Citas Agendadas ({appointments.length})
                    </p>
                    <ul className="space-y-2">
                      {appointments.map((item, idx) => (
                        <li
                          key={`cita-${idx}`}
                          className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800"
                        >
                          <div>
                            <Link href={item.href} className="text-xs font-semibold text-white hover:underline">
                              {item.label}
                            </Link>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{item.sublabel}</p>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-sky-950 text-sky-300 border border-sky-800">
                            {new Intl.DateTimeFormat('es', { timeZone, timeStyle: 'short' }).format(new Date(item.date))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {tasks.length > 0 && (
                  <div className="py-3 first:pt-0">
                    <p className="text-[10px] font-mono text-amber-400 uppercase tracking-wider mb-2">
                      Tareas con Vencimiento Hoy ({tasks.length})
                    </p>
                    <ul className="space-y-2">
                      {tasks.map((item, idx) => (
                        <li
                          key={`task-${idx}`}
                          className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800"
                        >
                          <div>
                            <Link href={item.href} className="text-xs font-semibold text-white hover:underline">
                              {item.label}
                            </Link>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{item.sublabel}</p>
                          </div>
                          <Link
                            href={item.href}
                            className="text-xs text-zinc-400 hover:text-white font-mono"
                          >
                            Ver tarea →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {payments.length > 0 && (
                  <div className="py-3 first:pt-0">
                    <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider mb-2">
                      Cobros del Día ({payments.length})
                    </p>
                    <ul className="space-y-2">
                      {payments.map((item, idx) => (
                        <li
                          key={`pay-${idx}`}
                          className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800"
                        >
                          <div>
                            <Link href={item.href} className="text-xs font-semibold text-white hover:underline">
                              {item.label}
                            </Link>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{item.sublabel}</p>
                          </div>
                          <Link
                            href={item.href}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-mono"
                          >
                            Cobrar →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Seguimientos Proactivos (WhatsApp) */}
        <div className="space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#25d366]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Seguimientos Comerciales (WhatsApp)
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {followups.length} {followups.length === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </div>

            {followups.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-medium text-white">Al día con todos los contactos</p>
                <p className="text-xs font-mono mt-1 text-zinc-500">
                  Ningún lead o cliente ha sobrepasado su SLA de seguimiento sin respuesta.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {followups.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className="p-3.5 bg-zinc-900/50 border border-zinc-800 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 ${
                            item.kind === 'lead'
                              ? 'bg-amber-900/50 text-amber-300 border border-amber-800'
                              : 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {item.kind === 'lead' ? 'Lead' : 'Cliente'}
                        </span>
                        <strong className="text-sm text-white">{item.name}</strong>
                        <span className="text-[10px] font-mono text-zinc-500">· {item.pipeline}</span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1">{item.reason}</p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                        <span>Sin contacto hace {item.daysSince} días</span>
                        <Link href={item.crmUrl} className="text-zinc-400 hover:text-white underline">
                          Ver ficha CRM
                        </Link>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                      <a
                        href={item.waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-[#25d366] hover:bg-[#20b858] text-black text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5 shadow-sm transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-black" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
