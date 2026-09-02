import { describe, expect, it, vi } from 'vitest'
import { getCalendarMonthData } from '@/lib/calendar-data'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

describe('Calendar Data Helper (getCalendarMonthData)', () => {
  it('calcula correctamente los límites del mes y mapea eventos de citas, tareas y pagos', async () => {
    const mockFind = vi.fn().mockImplementation(({ collection }) => {
      if (collection === 'appointments') {
        return Promise.resolve({
          totalDocs: 1,
          docs: [
            {
              id: 101,
              title: 'Demo con Cliente VIP',
              start: '2026-09-15T14:00:00.000Z',
              endDate: '2026-09-15T15:00:00.000Z',
              allDay: false,
              status: 'confirmed',
              location: 'Google Meet',
              htmlLink: 'https://meet.google.com/abc-def-ghi',
              client: { id: 5, name: 'Empresa Alpha', phone: '+584121234567' },
            },
          ],
        })
      }
      if (collection === 'tasks') {
        return Promise.resolve({
          totalDocs: 1,
          docs: [
            {
              id: 202,
              title: 'Enviar propuesta final',
              dueDate: '2026-09-18T18:00:00.000Z',
              priority: 'alta',
              status: 'pendiente',
            },
          ],
        })
      }
      if (collection === 'payments') {
        return Promise.resolve({
          totalDocs: 1,
          docs: [
            {
              id: 303,
              dueDate: '2026-09-20T00:00:00.000Z',
              amount: 450,
              concept: 'Mensualidad Septiembre',
              status: 'pendiente',
              client: { id: 5, name: 'Empresa Alpha' },
            },
          ],
        })
      }
      if (collection === 'memberships') {
        return Promise.resolve({
          totalDocs: 1,
          docs: [
            {
              id: 404,
              renewalDate: '2026-09-28T00:00:00.000Z',
              plan: 'Plan Pro',
              monthlyPrice: 150,
              status: 'activa',
              client: { id: 5, name: 'Empresa Alpha' },
            },
          ],
        })
      }
      return Promise.resolve({ docs: [], totalDocs: 0 })
    })

    const mockPayload = { find: mockFind } as unknown as Payload
    const mockUser = { id: 1, email: 'admin@martes.app' } as unknown as User

    const result = await getCalendarMonthData({
      payload: mockPayload,
      user: mockUser,
      tenantId: 1,
      year: 2026,
      month: 9,
    })

    expect(result.year).toBe(2026)
    expect(result.month).toBe(9)
    expect(result.monthName).toBe('Septiembre')
    expect(result.totals.citas).toBe(1)
    expect(result.totals.tasks).toBe(1)
    expect(result.totals.payments).toBe(1)
    expect(result.totals.memberships).toBe(1)

    // Verificar que los 4 eventos fueron unificados y ordenados
    expect(result.events).toHaveLength(4)

    // Primer evento: cita del 15 de sep
    const cita = result.events.find((e) => e.type === 'cita')
    expect(cita).toBeDefined()
    expect(cita?.title).toBe('Demo con Cliente VIP')
    expect(cita?.contactName).toBe('Empresa Alpha')
    expect(cita?.contactPhone).toBe('+584121234567')

    // Evento de tarea
    const task = result.events.find((e) => e.type === 'task')
    expect(task).toBeDefined()
    expect(task?.title).toBe('Enviar propuesta final')

    // Evento de pago
    const pay = result.events.find((e) => e.type === 'payment')
    expect(pay).toBeDefined()
    expect(pay?.amount).toBe(450)

    // Evento de membresía
    const mem = result.events.find((e) => e.type === 'membership')
    expect(mem).toBeDefined()
    expect(mem?.amount).toBe(150)
  })
})
