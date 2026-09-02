import type { Payload, Where } from 'payload'
import type { Appointment, Client, Membership, Payment, Task } from '@/payload-types'

export interface AgendaItem {
  type: 'task' | 'membership' | 'payment' | 'cita'
  date: string
  label: string
  sublabel: string
  href: string
}

/**
 * Agenda combinada de los próximos `days` días: citas espejadas de Google
 * Calendar, tareas por vencer, membresías por renovar y cobros por vencer —
 * antes vivían en páginas separadas sin ninguna vista unificada de "qué se
 * viene esta semana". Todo tenant-scoped, mismo patrón que el resto de
 * queries del dashboard.
 */
export async function getUpcomingAgenda(
  payload: Payload,
  tenantId: number,
  days: number,
): Promise<AgendaItem[]> {
  const now = new Date()
  const until = new Date(now.getTime() + days * 24 * 3600_000)
  const nowIso = now.toISOString()
  const untilIso = until.toISOString()

  const tenantWhere = (extra: Where): Where => ({ and: [{ tenant: { equals: tenantId } }, extra] })

  const [tasksRes, membershipsRes, paymentsRes, appointmentsRes] = await Promise.all([
    payload.find({
      collection: 'tasks',
      limit: 50,
      depth: 0,
      overrideAccess: false,
      where: tenantWhere({
        and: [
          { dueDate: { greater_than_equal: nowIso } },
          { dueDate: { less_than_equal: untilIso } },
          { status: { not_in: ['completada', 'cancelada'] } },
        ],
      }),
    }),
    payload.find({
      collection: 'memberships',
      limit: 50,
      depth: 1,
      overrideAccess: false,
      where: tenantWhere({
        and: [
          { renewalDate: { greater_than_equal: nowIso } },
          { renewalDate: { less_than_equal: untilIso } },
          { status: { equals: 'activa' } },
        ],
      }),
    }),
    payload.find({
      collection: 'payments',
      limit: 50,
      depth: 1,
      overrideAccess: false,
      where: tenantWhere({
        and: [
          { dueDate: { greater_than_equal: nowIso } },
          { dueDate: { less_than_equal: untilIso } },
          { status: { in: ['pendiente', 'vencido'] } },
        ],
      }),
    }),
    payload.find({
      collection: 'appointments',
      limit: 50,
      depth: 1,
      overrideAccess: false,
      where: tenantWhere({
        and: [
          { start: { greater_than_equal: nowIso } },
          { start: { less_than_equal: untilIso } },
          { status: { not_equals: 'cancelled' } },
        ],
      }),
    }),
  ])

  const items: AgendaItem[] = [
    ...(tasksRes.docs as Task[]).map((t) => ({
      type: 'task' as const,
      date: t.dueDate!,
      label: t.title,
      sublabel: `Tarea · prioridad ${t.priority}`,
      href: `/workspace/tasks/${t.id}`,
    })),
    ...(membershipsRes.docs as Membership[]).map((m) => {
      const clientName = typeof m.client === 'object' && m.client ? (m.client as Client).name : `Cliente #${m.client}`
      return {
        type: 'membership' as const,
        date: m.renewalDate,
        label: `Renovación · ${clientName}`,
        sublabel: `${m.plan} · $${m.monthlyPrice}/mes`,
        href: '/workspace/memberships',
      }
    }),
    ...(paymentsRes.docs as Payment[]).map((p) => {
      const clientName = typeof p.client === 'object' && p.client ? (p.client as Client).name : `Cliente #${p.client}`
      return {
        type: 'payment' as const,
        date: p.dueDate,
        label: `Cobro · ${clientName}`,
        sublabel: p.concept || `$${p.amount}`,
        href: '/workspace/billing',
      }
    }),
    ...(appointmentsRes.docs as Appointment[]).map((a) => {
      const clientObj = typeof a.client === 'object' && a.client ? (a.client as Client) : null
      const leadId = typeof a.lead === 'object' && a.lead ? a.lead.id : a.lead
      const timeFmt = new Intl.DateTimeFormat('es-VE', { hour: '2-digit', minute: '2-digit' })
      const hora = a.allDay ? 'todo el día' : timeFmt.format(new Date(a.start))
      return {
        type: 'cita' as const,
        date: a.start,
        label: `Cita · ${a.title}`,
        sublabel: `${hora}${a.location ? ` · ${a.location}` : ''}${a.status === 'tentative' ? ' · tentativa' : ''}`,
        href: clientObj
          ? `/workspace/crm/clientes/${clientObj.id}`
          : leadId
            ? `/workspace/crm/leads/${leadId}`
            : a.htmlLink || '/workspace',
      }
    }),
  ]

  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
