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
  const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear()
  const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1

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
