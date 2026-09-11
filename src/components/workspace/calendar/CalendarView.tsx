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
import { TaskCreateDialog } from '@/components/workspace/TaskCreateDialog'
import { Button } from '@/components/ui/button'
import type { Client, Lead, User as PayloadUser } from '@/payload-types'

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

function formatEventDate(dateStr: string, allDay = false): string {
  if (allDay) {
    const ymd = dateStr.slice(0, 10)
    const [yearStr, monthStr, dayStr] = ymd.split('-')
    const y = parseInt(yearStr, 10)
    const m = parseInt(monthStr, 10) - 1
    const d = parseInt(dayStr, 10)
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      const utcDate = new Date(Date.UTC(y, m, d, 12, 0, 0))
      return new Intl.DateTimeFormat('es-VE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }).format(utcDate)
    }
  }
  return dateHeaderFmt.format(new Date(dateStr))
}

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

interface CalendarViewProps {
  data: CalendarMonthData
  canEdit?: boolean
  assignees?: PayloadUser[]
  clients?: Client[]
  leads?: Lead[]
}

export function CalendarView({
  data,
  canEdit,
  assignees,
  clients,
  leads,
}: CalendarViewProps) {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-border bg-background p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border bg-background">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={prevMonth}
              className="rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-bold uppercase font-mono text-foreground tracking-wider">
              {monthName} {year}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={goToday}
            className="border-input bg-muted px-3 font-mono text-xs font-bold uppercase text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            Hoy
          </Button>

          {canEdit && assignees && assignees.length > 0 && (
            <TaskCreateDialog
              assignees={assignees}
              clients={clients ?? []}
              leads={leads ?? []}
              variant="secondary"
              redirectTo={`/workspace/calendar?year=${year}&month=${month}`}
            />
          )}
        </div>

        {/* Filtros rápidos */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilter('all')}
            className={`h-auto rounded-none border px-2.5 py-1 text-[11px] font-bold uppercase ${
              filter === 'all'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos ({events.length})
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilter('cita')}
            className={`h-auto flex items-center gap-1 rounded-none border px-2.5 py-1 text-[11px] font-bold uppercase ${
              filter === 'cita'
                ? 'border-sky-400 bg-sky-950/80 text-sky-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarClock className="size-3 text-sky-400" />
            Citas ({totals.citas})
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilter('task')}
            className={`h-auto flex items-center gap-1 rounded-none border px-2.5 py-1 text-[11px] font-bold uppercase ${
              filter === 'task'
                ? 'border-indigo-400 bg-indigo-950/80 text-indigo-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <SquareCheck className="size-3 text-indigo-400" />
            Tareas ({totals.tasks})
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilter('payment')}
            className={`h-auto flex items-center gap-1 rounded-none border px-2.5 py-1 text-[11px] font-bold uppercase ${
              filter === 'payment'
                ? 'border-amber-400 bg-amber-950/80 text-amber-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <CircleDollarSign className="size-3 text-amber-400" />
            Cobros ({totals.payments})
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilter('membership')}
            className={`h-auto flex items-center gap-1 rounded-none border px-2.5 py-1 text-[11px] font-bold uppercase ${
              filter === 'membership'
                ? 'border-emerald-400 bg-emerald-950/80 text-emerald-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCcw className="size-3 text-emerald-400" />
            Membresías ({totals.memberships})
          </Button>
        </div>
      </div>

      {/* Cuadrícula del Calendario */}
      <div className="border border-border bg-background shadow-2xl overflow-hidden">
        {/* Cabecera de días de la semana */}
        <div className="grid grid-cols-7 border-b border-border bg-background/60 text-center font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="py-2.5 border-r border-border/60 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Días en cuadrícula */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border">
          {allGridDays.map((gridDay, idx) => {
            const isToday = gridDay.dateKey === todayKey
            const dayEvents = eventsByDay.get(gridDay.dateKey) ?? []

            return (
              <div
                key={`${gridDay.dateKey}-${idx}`}
                className={`min-h-[115px] p-1.5 flex flex-col transition ${
                  gridDay.currentMonth ? 'bg-background' : 'bg-background/40 opacity-40'
                } ${isToday ? 'ring-1 ring-inset ring-sky-400/80' : ''}`}
              >
                <div className="flex items-center justify-between px-1 mb-1">
                  <span
                    className={`font-mono text-xs ${
                      isToday
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-black font-extrabold'
                        : gridDay.currentMonth
                        ? 'text-foreground/80 font-semibold'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {gridDay.day}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground">
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
                      <Button
                        key={event.id}
                        type="button"
                        variant="outline"
                        onClick={() => setSelectedEvent(event)}
                        className={`h-auto w-full justify-start gap-1 rounded border px-1.5 py-0.5 text-left text-[10px] font-mono ${badgeStyle}`}
                        title={event.title}
                      >
                        {isCita ? (
                          <CalendarClock className="size-[9px] shrink-0 text-sky-400" />
                        ) : isTask ? (
                          <SquareCheck className="size-[9px] shrink-0 text-indigo-400" />
                        ) : (
                          <CircleDollarSign className="size-[9px] shrink-0 text-amber-400" />
                        )}
                        <span className="truncate">{event.title}</span>
                      </Button>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setSelectedDayEvents({ dateKey: gridDay.dateKey, events: dayEvents })}
                      className="h-auto w-full justify-center p-0 text-[9px] font-mono text-muted-foreground hover:text-foreground hover:underline"
                    >
                      +{dayEvents.length - 3} más
                    </Button>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="w-full max-w-md border border-border bg-background p-5 shadow-2xl text-foreground font-mono space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border pb-3">
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
                <h3 className="text-base font-bold text-foreground font-sans">{selectedEvent.title}</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedEvent(null)}
                aria-label="Cerrar"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2 text-xs text-foreground/80">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {formatEventDate(selectedEvent.date, selectedEvent.allDay)}
                  {!selectedEvent.allDay && ` · ${timeFmt.format(new Date(selectedEvent.date))}`}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{selectedEvent.location}</span>
                </div>
              )}

              {selectedEvent.sublabel && (
                <div className="text-[11px] text-muted-foreground border-l-2 border-muted-foreground/40 pl-2">
                  {selectedEvent.sublabel}
                </div>
              )}

              {selectedEvent.contactName && (
                <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground font-bold">{selectedEvent.contactName}</span>
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

            <div className="flex items-center justify-between border-t border-border pt-3">
              {selectedEvent.href ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-muted px-3 text-xs font-bold uppercase text-foreground hover:bg-accent hover:text-foreground"
                >
                  <a
                    href={selectedEvent.href}
                    target={selectedEvent.href.startsWith('http') ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3" />
                    {selectedEvent.href.includes('google.com')
                      ? 'Abrir en Google'
                      : 'Abrir detalle'}
                  </a>
                </Button>
              ) : <div />}

              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedEvent(null)}
                className="px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog de Lista Completa de Eventos del Día */}
      {selectedDayEvents && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDayEvents(null)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border bg-background p-5 shadow-2xl text-foreground font-mono space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Compromisos del día</p>
                <h3 className="text-base font-bold text-foreground mt-1">
                  {selectedDayEvents.dateKey} · {selectedDayEvents.events.length} eventos
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedDayEvents(null)}
                aria-label="Cerrar"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-[18px]" />
              </Button>
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
                  <Button
                    key={event.id}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedDayEvents(null)
                      setSelectedEvent(event)
                    }}
                    className={`h-auto w-full justify-between gap-2 rounded border p-2.5 ${badgeStyle}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isCita ? (
                        <CalendarClock className="size-3.5 shrink-0 text-sky-400" />
                      ) : isTask ? (
                        <SquareCheck className="size-3.5 shrink-0 text-indigo-400" />
                      ) : (
                        <CircleDollarSign className="size-3.5 shrink-0 text-amber-400" />
                      )}
                      <span className="text-xs font-semibold text-foreground truncate">{event.title}</span>
                    </div>
                    {event.sublabel && (
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {event.sublabel}
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
