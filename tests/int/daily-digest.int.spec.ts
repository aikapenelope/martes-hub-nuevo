import { describe, expect, it, vi } from 'vitest'
import { shouldDispatchDigest, dailyDigestTask } from '@/jobs/dailyDigest'
import type { Payload } from 'payload'

describe('Daily Digest DST & Idempotency Rules', () => {
  it('despacha cuando la hora local coincide exactamente con la configurada y no se ha enviado hoy', () => {
    const result = shouldDispatchDigest({
      currentHour: 8,
      targetHour: 8,
      alreadyDispatchedToday: false,
    })
    expect(result).toBe(true)
  })

  it('no despacha antes de la hora configurada', () => {
    const result = shouldDispatchDigest({
      currentHour: 7,
      targetHour: 8,
      alreadyDispatchedToday: false,
    })
    expect(result).toBe(false)
  })

  it('activa catch-up en transición de horario de verano (spring-forward) si la hora 2 fue saltada y el reloj marca las 3', () => {
    // Si la hora 2 no existió y el cron corre a las 3:00 AM
    const result = shouldDispatchDigest({
      currentHour: 3,
      targetHour: 2,
      alreadyDispatchedToday: false,
    })
    expect(result).toBe(true)
  })

  it('evita duplicados en horario de invierno (fall-back) cuando la hora se repite', () => {
    // Si la hora 1 se repite por atraso del reloj, pero ya fue despachado en la primera iteración
    const result = shouldDispatchDigest({
      currentHour: 1,
      targetHour: 1,
      alreadyDispatchedToday: true,
    })
    expect(result).toBe(false)
  })

  it('evita despachar en las horas posteriores del mismo día si ya fue enviado', () => {
    const result = shouldDispatchDigest({
      currentHour: 14,
      targetHour: 8,
      alreadyDispatchedToday: true,
    })
    expect(result).toBe(false)
  })
})

describe('Daily Digest Task Execution with Email Log Claims', () => {
  it('registra el envío en email-log para asegurar idempotencia', async () => {
    const createdLogs: unknown[] = []
    const sentEmails: unknown[] = []

    const mockFind = vi.fn().mockImplementation(({ collection }) => {
      if (collection === 'tenants') {
        return Promise.resolve({
          docs: [{ id: 1, name: 'Tenant Alpha', slug: 'alpha' }],
          totalDocs: 1,
        })
      }
      if (collection === 'company-settings') {
        return Promise.resolve({
          docs: [
            {
              id: 10,
              tenant: 1,
              timezone: 'America/Caracas',
              digestHour: 0, // medianoche para asegurar que currentHour >= 0
              internalNotificationsEmail: 'notificaciones@alpha.com',
            },
          ],
          totalDocs: 1,
        })
      }
      if (collection === 'email-log') {
        // Ninguno enviado todavía hoy
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
      if (collection === 'payments') {
        return Promise.resolve({ docs: [], totalDocs: 0 })
      }
      return Promise.resolve({ docs: [], totalDocs: 0 })
    })

    const mockCount = vi.fn().mockResolvedValue({ totalDocs: 0 })

    const mockCreate = vi.fn().mockImplementation(({ collection, data }) => {
      if (collection === 'email-log') {
        createdLogs.push(data)
      }
      return Promise.resolve({ id: 99, ...data })
    })

    const mockSendEmail = vi.fn().mockImplementation((payload) => {
      sentEmails.push(payload)
      return Promise.resolve()
    })

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    const mockPayload = {
      find: mockFind,
      count: mockCount,
      create: mockCreate,
      sendEmail: mockSendEmail,
      logger: mockLogger,
    } as unknown as Payload

    if (typeof dailyDigestTask.handler !== 'function') {
      throw new Error('dailyDigestTask.handler must be a function')
    }

    type TaskArgs = Parameters<Extract<typeof dailyDigestTask.handler, (...args: never[]) => unknown>>[0]
    const args = {
      req: { payload: mockPayload },
    } as unknown as TaskArgs

    const result = (await dailyDigestTask.handler(args)) as {
      output: { sent: boolean; summary: string }
    }

    expect(result.output.sent).toBe(true)
    expect(sentEmails).toHaveLength(1)
    expect(createdLogs).toHaveLength(1)
    expect((createdLogs[0] as { to: string }).to).toBe('notificaciones@alpha.com')
  })
})
