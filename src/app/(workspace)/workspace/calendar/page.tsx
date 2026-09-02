import 'server-only'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { PageHero } from '@/components/workspace/oled'
import { getCalendarMonthData } from '@/lib/calendar-data'
import { CalendarView } from '@/components/workspace/calendar/CalendarView'

interface CalendarPageProps {
  searchParams: Promise<{
    year?: string
    month?: string
  }>
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { year: yearParam, month: monthParam } = await searchParams
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, tenant } = context

  const now = new Date()
  let defaultYear = now.getFullYear()
  let defaultMonth = now.getMonth() + 1
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
    }).format(now)
    const [y, m] = parts.split('-').map(Number)
    if (y && m) {
      defaultYear = y
      defaultMonth = m
    }
  } catch {}

  const parsedYear = yearParam ? Number(yearParam) : NaN
  const parsedMonth = monthParam ? Number(monthParam) : NaN
  const year = Number.isInteger(parsedYear) && parsedYear >= 1 && parsedYear <= 9999 ? parsedYear : defaultYear
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : defaultMonth

  const calendarData = await getCalendarMonthData({
    payload,
    user,
    tenantId,
    year,
    month,
  })

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Operaciones · ${tenant.name}`}
        title="Calendario & Agenda Unificada"
        description="Visualización centralizada de citas de Google Calendar, compromisos comerciales, tareas por vencer y cobros del mes."
      />

      <CalendarView data={calendarData} />
    </div>
  )
}
