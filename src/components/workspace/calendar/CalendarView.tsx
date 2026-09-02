'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCcw,
  SquareCheck,
  User,
  X,
} from 'lucide-react'
import type { CalendarEvent, CalendarMonthData } from '@/lib/calendar-data'

type FilterType = 'all' | 'cita' | 'task' | 'payment' | 'membership'

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const timeFmt = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Caracas',
})

const dateHeaderFmt = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Caracas',
})

function getCaracasDateKey(isoOrDate: string, isAllDay = false): string {
  if (isAllDay && /^\d{4}-\d{2}-\d{2}/.test(isoOrDate)) {
    return isoOrDate.slice(0, 10)
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoOrDate))
  } catch {
    return isoOrDate.slice(0, 10)
  }
}

function getCaracasToday(): { year: number; month: number; dateKey: string } {
  const now = new Date()
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const [y, m] = parts.split('-').map(Number)
    return { year: y, month: m, dateKey: parts }
  } catch {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = String(now.getDate()).padStart(2, '0')
    return { year: y, month: m, dateKey: `${y}-${String(m).padStart(2, '0')}-${d}` }
  }
}

export function CalendarView({ data }: { data: CalendarMonthData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ dateKey: string; events: CalendarEvent[] } | null>(null)

  const { year, month, monthName, events, totals } = data

  // Filtrado de eventos
  const filteredEvents =
    filter === 'all' ? events : events.filter((e) => e.type === filter)

  // Agrupación por día (clave YYYY-MM-DD en zona horaria America/Caracas para consistencia estricta)
  const eventsByDay = new Map<string, CalendarEvent[]>()
  for (const event of filteredEvents) {
    const key = getCaracasDateKey(event.date, event.allDay)
    const list = eventsByDay.get(key) ?? []
    list.push(event)
    eventsByDay.set(key, list)
  }

  // Generar la cuadrícula del mes
  // Primer día del mes (1-indexado para días, 0-indexado para mes en JS)
  const firstDayOfMonth = new Date(year, month - 1, 1)
  const lastDayOfMonth = new Date(year, month, 0)
  const totalDays = lastDayOfMonth.getDate()

  // Día de la semana en que empieza (0: Dom, 1: Lun, ..., 6: Sáb) -> Convertir a Lun=0 ... Dom=6
  let startDayOfWeek = firstDayOfMonth.getDay() - 1
  if (startDayOfWeek === -1) startDayOfWeek = 6

  // Días del mes anterior para rellenar
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate()
  const paddingDaysBefore = []
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    paddingDaysBefore.push({
      day: prevMonthLastDay - i,
      currentMonth: false,
      dateKey: `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}-${String(prevMonthLastDay - i).padStart(2, '0')}`,
    })
  }

  // Días del mes actual
  const currentMonthDays = []
  for (let i = 1; i <= totalDays; i++) {
    currentMonthDays.push({
      day: i,
      currentMonth: true,
      dateKey: `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
    })
  }

  // Días del mes siguiente para completar múltiplos de 7
  const totalCells = paddingDaysBefore.length + currentMonthDays.length
  const remainder = totalCells % 7
  const paddingDaysAfter = []
  if (remainder > 0) {
    const needed = 7 - remainder
    for (let i = 1; i <= needed; i++) {
      paddingDaysAfter.push({
        day: i,
        currentMonth: false,
        dateKey: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
      })
    }
  }

  const allGridDays = [...paddingDaysBefore, ...currentMonthDays, ...paddingDaysAfter]

  // Detectar hoy en America/Caracas
  const { dateKey: todayKey } = getCaracasToday()

  // Navegación de mes
  function goToMonth(targetYear: number, targetMonth: number) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('year', String(targetYear))
    params.set('month', String(targetMonth))
    router.push(`/workspace/calendar?${params.toString()}`)
  }

  function prevMonth() {
    if (month === 1) goToMonth(year - 1, 12)
    else goToMonth(year, month - 1)
  }

  function nextMonth() {
    if (month === 12) goToMonth(year + 1, 1)
    else goToMonth(year, month + 1)
  }

  function goToday() {
    const { year: caracasYear, month: caracasMonth } = getCaracasToday()
    goToMonth(caracasYear, caracasMonth)
  }

  return (
    <div className="space-y-4">
      {/* Barra de Control: Navegación de Mes + Filtros de Categoría */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-zinc-800 bg-black">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 text-zinc-400 hover:text-white transition hover:bg-zinc-900"
              title="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-sm font-bold uppercase font-mono text-white tracking-wider">
              {monthName} {year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-2 text-zinc-400 hover:text-white transition hover:bg-zinc-900"
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToday}
            className="border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-mono uppercase font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
          >
            Hoy
          </button>
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-[11px] font-bold transition border uppercase ${
              filter === 'all'
                ? 'border-white bg-white text-black'
                : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            Todos ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('cita')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition border uppercase ${
              filter === 'cita'
                ? 'border-sky-400 bg-sky-950/80 text-sky-300'
                : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            <CalendarClock size={12} className="text-sky-400" />
            Citas ({totals.citas})
          </button>
          <button
            type="button"
            onClick={() => setFilter('task')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition border uppercase ${
              filter === 'task'
                ? 'border-indigo-400 bg-indigo-950/80 text-indigo-300'
                : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            <SquareCheck size={12} className="text-indigo-400" />
            Tareas ({totals.tasks})
          </button>
          <button
            type="button"
            onClick={() => setFilter('payment')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition border uppercase ${
              filter === 'payment'
                ? 'border-amber-400 bg-amber-950/80 text-amber-300'
                : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            <CircleDollarSign size={12} className="text-amber-400" />
            Cobros ({totals.payments})
          </button>
          <button
            type="button"
            onClick={() => setFilter('membership')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition border uppercase ${
              filter === 'membership'
                ? 'border-emerald-400 bg-emerald-950/80 text-emerald-300'
                : 'border-zinc-800 bg-black text-zinc-400 hover:text-white'
            }`}
          >
            <RefreshCcw size={12} className="text-emerald-400" />
            Membresías ({totals.memberships})
          </button>
        </div>
      </div>

      {/* Cuadrícula del Calendario */}
      <div className="border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Cabecera de días de la semana */}
        <div className="grid grid-cols-7 border-b border-zinc-800 bg-black/60 text-center font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="py-2.5 border-r border-zinc-800/60 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Días en cuadrícula */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-zinc-900">
          {allGridDays.map((gridDay, idx) => {
            const isToday = gridDay.dateKey === todayKey
            const dayEvents = eventsByDay.get(gridDay.dateKey) ?? []

            return (
              <div
                key={`${gridDay.dateKey}-${idx}`}
                className={`min-h-[115px] p-1.5 flex flex-col transition ${
                  gridDay.currentMonth ? 'bg-zinc-950' : 'bg-black/40 opacity-40'
                } ${isToday ? 'ring-1 ring-inset ring-sky-400/80' : ''}`}
              >
                <div className="flex items-center justify-between px-1 mb-1">
                  <span
                    className={`font-mono text-xs ${
                      isToday
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-black font-extrabold'
                        : gridDay.currentMonth
                        ? 'text-zinc-300 font-semibold'
                        : 'text-zinc-600'
                    }`}
                  >
                    {gridDay.day}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[9px] font-mono text-zinc-500">
                      {dayEvents.length}
                    </span>
                  )}
                </div>

                {/* Eventos del día */}
                <div className="space-y-1 overflow-y-auto max-h-24">
                  {dayEvents.slice(0, 3).map((event) => {
                    const isCita = event.type === 'cita'
                    const isTask = event.type === 'task'
                    const isPay = event.type === 'payment'

                    const badgeStyle = isCita
                      ? 'border-sky-800/80 bg-sky-950/70 text-sky-300 hover:border-sky-400'
                      : isTask
                      ? 'border-indigo-800/80 bg-indigo-950/70 text-indigo-300 hover:border-indigo-400'
                      : isPay
                      ? 'border-amber-800/80 bg-amber-950/70 text-amber-300 hover:border-amber-400'
                      : 'border-emerald-800/80 bg-emerald-950/70 text-emerald-300 hover:border-emerald-400'

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setSelectedEvent(event)}
                        className={`w-full text-left truncate rounded border px-1.5 py-0.5 text-[10px] font-mono transition flex items-center gap-1 ${badgeStyle}`}
                        title={event.title}
                      >
                        {isCita ? (
                          <CalendarClock size={9} className="shrink-0 text-sky-400" />
                        ) : isTask ? (
                          <SquareCheck size={9} className="shrink-0 text-indigo-400" />
                        ) : (
                          <CircleDollarSign size={9} className="shrink-0 text-amber-400" />
                        )}
                        <span className="truncate">{event.title}</span>
                      </button>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setSelectedDayEvents({ dateKey: gridDay.dateKey, events: dayEvents })}
                      className="w-full text-center text-[9px] font-mono text-zinc-500 hover:text-white hover:underline transition cursor-pointer"
                    >
                      +{dayEvents.length - 3} más
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal / Dialog de Detalle del Evento */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-md border border-zinc-800 bg-zinc-950 p-5 shadow-2xl text-white font-mono space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div>
                <span
                  className={`inline-block border px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider mb-1.5 ${
                    selectedEvent.type === 'cita'
                      ? 'border-sky-500 text-sky-400 bg-sky-950/60'
                      : selectedEvent.type === 'task'
                      ? 'border-indigo-500 text-indigo-400 bg-indigo-950/60'
                      : 'border-amber-500 text-amber-400 bg-amber-950/60'
                  }`}
                >
                  {selectedEvent.type === 'cita'
                    ? 'Cita de Google Calendar'
                    : selectedEvent.type === 'task'
                    ? 'Tarea de Workspace'
                    : selectedEvent.type === 'payment'
                    ? 'Cobro / Facturación'
                    : 'Renovación de Membresía'}
                </span>
                <h3 className="text-base font-bold text-white font-sans">{selectedEvent.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-zinc-500 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-zinc-500 shrink-0" />
                <span>
                  {dateHeaderFmt.format(new Date(selectedEvent.date))}
                  {!selectedEvent.allDay && ` · ${timeFmt.format(new Date(selectedEvent.date))}`}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-zinc-500 shrink-0" />
                  <span className="truncate">{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.sublabel && (
                <div className="text-[11px] text-zinc-400 border-l-2 border-zinc-700 pl-2">
                  {selectedEvent.sublabel}
                </div>
              )}

              {selectedEvent.contactName && (
                <div className="flex items-center justify-between border-t border-zinc-900 pt-2 mt-2">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-white font-bold">{selectedEvent.contactName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedEvent.contactPhone && (
                      <a
                        href={`https://wa.me/${selectedEvent.contactPhone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-[#25d366]/20 border border-[#25d366]/50 px-2 py-0.5 text-[10px] text-[#25d366] hover:bg-[#25d366]/30 font-bold"
                        title="Chat WhatsApp"
                      >
                        <MessageCircle size={10} /> WhatsApp
                      </a>
                    )}
                    {selectedEvent.contactHref && (
                      <Link
                        href={selectedEvent.contactHref}
                        className="text-sky-400 hover:underline text-[10px]"
                      >
                        Ver ficha CRM →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-900 pt-3">
              {selectedEvent.href ? (
                <a
                  href={selectedEvent.href}
                  target={selectedEvent.href.startsWith('http') ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs text-white font-bold uppercase transition"
                >
                  <ExternalLink size={12} />
                  {selectedEvent.href.includes('google.com')
                    ? 'Abrir en Google'
                    : 'Abrir detalle'}
                </a>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog de Lista Completa de Eventos del Día */}
      {selectedDayEvents && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDayEvents(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto border border-zinc-800 bg-zinc-950 p-5 shadow-2xl text-white font-mono space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div>
                <p className="text-xs text-zinc-400 uppercase tracking-wider">Compromisos del día</p>
                <h3 className="text-base font-bold text-white mt-1">
                  {selectedDayEvents.dateKey} · {selectedDayEvents.events.length} eventos
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="text-zinc-500 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {selectedDayEvents.events.map((event) => {
                const isCita = event.type === 'cita'
                const isTask = event.type === 'task'
                const badgeStyle = isCita
                  ? 'border-sky-800 bg-sky-950/40 text-sky-200 hover:border-sky-500'
                  : isTask
                  ? 'border-indigo-800 bg-indigo-950/40 text-indigo-200 hover:border-indigo-500'
                  : 'border-amber-800 bg-amber-950/40 text-amber-200 hover:border-amber-500'

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      setSelectedDayEvents(null)
                      setSelectedEvent(event)
                    }}
                    className={`w-full text-left p-2.5 border rounded flex items-center justify-between gap-2 transition cursor-pointer ${badgeStyle}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isCita ? (
                        <CalendarClock size={14} className="shrink-0 text-sky-400" />
                      ) : isTask ? (
                        <SquareCheck size={14} className="shrink-0 text-indigo-400" />
                      ) : (
                        <CircleDollarSign size={14} className="shrink-0 text-amber-400" />
                      )}
                      <span className="text-xs font-semibold text-white truncate">{event.title}</span>
                    </div>
                    {event.sublabel && (
                      <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                        {event.sublabel}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
