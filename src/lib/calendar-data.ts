import 'server-only'

import type { Payload, Where } from 'payload'
import type { Appointment, Client, Lead, Membership, Payment, Task, User } from '@/payload-types'

export interface CalendarEvent {
  id: string
  title: string
  type: 'cita' | 'task' | 'payment' | 'membership'
  date: string // ISO string YYYY-MM-DD o con hora
  endDate?: string
  allDay?: boolean
  status?: string
  sublabel?: string
  location?: string
  href?: string
  amount?: number
  contactName?: string
  contactPhone?: string
  contactHref?: string
}

export interface CalendarMonthData {
  year: number
  month: number // 1-12
  monthName: string
  events: CalendarEvent[]
  totals: {
    citas: number
    tasks: number
    payments: number
    memberships: number
  }
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export async function getCalendarMonthData({
  payload,
  user,
  tenantId,
  year,
  month,
}: {
  payload: Payload
  user: User
  tenantId: number
  year: number
  month: number // 1-12
}): Promise<CalendarMonthData> {
  // Primer y último día del mes en UTC con margen para la cuadrícula (días del mes anterior/siguiente)
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  // Restamos 7 días para cubrir el inicio de la semana
  const gridStart = new Date(startOfMonth.getTime() - 7 * 24 * 3600_000)

  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59))
  // Sumamos 14 días para cubrir el final de la cuadrícula
  const gridEnd = new Date(endOfMonth.getTime() + 14 * 24 * 3600_000)

  const startIso = gridStart.toISOString()
  const endIso = gridEnd.toISOString()

  const tenantWhere = (extra: Where): Where => ({
    and: [{ tenant: { equals: tenantId } }, extra],
  })

  const [appointmentsRes, tasksRes, paymentsRes, membershipsRes] = await Promise.all([
    // Citas espejadas de Google Calendar
    payload.find({
      collection: 'appointments',
      limit: 200,
      depth: 1,
      overrideAccess: false,
      user,
      where: tenantWhere({
        and: [
          { start: { greater_than_equal: startIso } },
          { start: { less_than_equal: endIso } },
          { status: { not_equals: 'cancelled' } },
        ],
      }),
    }),
    // Tareas con fecha de vencimiento
    payload.find({
      collection: 'tasks',
      limit: 200,
      depth: 0,
      overrideAccess: false,
      user,
      where: tenantWhere({
        and: [
          { dueDate: { greater_than_equal: startIso } },
          { dueDate: { less_than_equal: endIso } },
          { status: { not_equals: 'cancelada' } },
        ],
      }),
    }),
    // Cobros y facturas
    payload.find({
      collection: 'payments',
      limit: 200,
      depth: 1,
      overrideAccess: false,
      user,
      where: tenantWhere({
        and: [
          { dueDate: { greater_than_equal: startIso } },
          { dueDate: { less_than_equal: endIso } },
        ],
      }),
    }),
    // Renovaciones de membresías
    payload.find({
      collection: 'memberships',
      limit: 200,
      depth: 1,
      overrideAccess: false,
      user,
      where: tenantWhere({
        and: [
          { renewalDate: { greater_than_equal: startIso } },
          { renewalDate: { less_than_equal: endIso } },
          { status: { equals: 'activa' } },
        ],
      }),
    }),
  ])

  const events: CalendarEvent[] = []

  // 1. Mapear Citas
  for (const a of appointmentsRes.docs as Appointment[]) {
    const clientObj = typeof a.client === 'object' && a.client ? (a.client as Client) : null
    const leadObj = typeof a.lead === 'object' && a.lead ? (a.lead as Lead) : null
    const contactName = clientObj?.name ?? leadObj?.fullName
    const contactPhone = clientObj?.phone ?? leadObj?.phone
    const contactHref = clientObj
      ? `/workspace/crm/clientes/${clientObj.id}`
      : leadObj
      ? `/workspace/crm/leads/${leadObj.id}`
      : undefined

    events.push({
      id: `cita-${a.id}`,
      title: a.title || 'Reunión agendada',
      type: 'cita',
      date: a.start,
      endDate: a.endDate ?? undefined,
      allDay: Boolean(a.allDay),
      status: a.status ?? 'confirmed',
      sublabel: a.location ? a.location : a.allDay ? 'Todo el día' : undefined,
      location: a.location ?? undefined,
      href: a.htmlLink ?? contactHref ?? '/workspace/calendar',
      contactName,
      contactPhone: contactPhone ?? undefined,
      contactHref,
    })
  }

  // 2. Mapear Tareas
  for (const t of tasksRes.docs as Task[]) {
    if (!t.dueDate) continue
    events.push({
      id: `task-${t.id}`,
      title: t.title,
      type: 'task',
      date: t.dueDate,
      allDay: true,
      status: t.status,
      sublabel: `Prioridad ${t.priority}`,
      href: `/workspace/tasks/${t.id}`,
    })
  }

  // 3. Mapear Pagos
  for (const p of paymentsRes.docs as Payment[]) {
    const clientObj = typeof p.client === 'object' && p.client ? (p.client as Client) : null
    events.push({
      id: `payment-${p.id}`,
      title: `Cobro: ${clientObj?.name ?? 'Cliente'}`,
      type: 'payment',
      date: p.dueDate,
      allDay: true,
      status: p.status,
      amount: p.amount,
      sublabel: p.concept || `$${p.amount}`,
      href: '/workspace/billing',
      contactName: clientObj?.name,
      contactHref: clientObj ? `/workspace/crm/clientes/${clientObj.id}` : undefined,
    })
  }

  // 4. Mapear Membresías
  for (const m of membershipsRes.docs as Membership[]) {
    const clientObj = typeof m.client === 'object' && m.client ? (m.client as Client) : null
    events.push({
      id: `membership-${m.id}`,
      title: `Renovación: ${clientObj?.name ?? 'Membresía'}`,
      type: 'membership',
      date: m.renewalDate,
      allDay: true,
      status: m.status,
      amount: m.monthlyPrice,
      sublabel: `${m.plan} ($${m.monthlyPrice}/mes)`,
      href: '/workspace/memberships',
      contactName: clientObj?.name,
      contactHref: clientObj ? `/workspace/crm/clientes/${clientObj.id}` : undefined,
    })
  }

  // Ordenar cronológicamente
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    year,
    month,
    monthName: MONTH_NAMES[month - 1] ?? '',
    events,
    totals: {
      citas: appointmentsRes.totalDocs,
      tasks: tasksRes.totalDocs,
      payments: paymentsRes.totalDocs,
      memberships: membershipsRes.totalDocs,
    },
  }
}
