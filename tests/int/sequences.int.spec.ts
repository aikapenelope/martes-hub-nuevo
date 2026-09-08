import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import {
  dispatchTenantSequences,
  peekNextAction,
  repliedSince,
  validateSequenceStepDays,
  type SequenceStep,
} from '@/lib/sequences'
import { dispatchSequencesTask } from '@/jobs/dispatchSequences'

const NOW = Date.parse('2026-09-08T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString()
const daysAgoIso = (days: number): string => iso(-days * DAY_MS)

const EMAIL_STEP: SequenceStep = { type: 'email', subject: 'Hola {{nombre}}', bodyHtml: '<p>Oferta</p>' }
const TASK_STEP: SequenceStep = { type: 'tarea', taskTitle: 'Llamar a {{nombre}}', taskDueInDays: 2 }
const wait = (days: number): SequenceStep => ({ type: 'esperar', days })

describe('peekNextAction — máquina de pasos', () => {
  it('arranca directo en el primer paso ejecutable sin esperas', () => {
    const res = peekNextAction([EMAIL_STEP, wait(3), EMAIL_STEP], 0)
    expect(res).toEqual({ done: false, waitDays: 0, actionIndex: 0 })
  })

  it('consume esperas intermedias acumulando días', () => {
    const res = peekNextAction([EMAIL_STEP, wait(3), wait(2), TASK_STEP], 1)
    expect(res).toEqual({ done: false, waitDays: 5, actionIndex: 3 })
  })

  it('solo esperas hasta el final → done', () => {
    const res = peekNextAction([EMAIL_STEP, wait(3)], 1)
    expect(res.done).toBe(true)
    expect(res.actionIndex).toBeNull()
  })

  it('índice fuera de rango → done (sin pasos restantes)', () => {
    expect(peekNextAction([EMAIL_STEP], 1).done).toBe(true)
    expect(peekNextAction([EMAIL_STEP], 99).done).toBe(true)
  })

  it('espera sin días definidos cuenta como 1 día (guard)', () => {
    const res = peekNextAction([{ type: 'esperar' }, EMAIL_STEP], 0)
    expect(res.waitDays).toBe(1)
    expect(res.actionIndex).toBe(1)
  })
})

describe('validateSequenceStepDays — validación server-side por tipo', () => {
  it('exige entero 1-90 solo para pasos esperar', () => {
    expect(validateSequenceStepDays(5, 'esperar')).toBe(true)
    expect(validateSequenceStepDays(90, 'esperar')).toBe(true)
    expect(validateSequenceStepDays(undefined, 'esperar')).toMatch(/días/)
    expect(validateSequenceStepDays('', 'esperar')).toMatch(/días/)
    expect(validateSequenceStepDays(0, 'esperar')).not.toBe(true)
    expect(validateSequenceStepDays(91, 'esperar')).not.toBe(true)
    expect(validateSequenceStepDays(2.5, 'esperar')).not.toBe(true)
  })

  it('no exige days en pasos email/tarea (admin.condition solo oculta el input)', () => {
    expect(validateSequenceStepDays(undefined, 'email')).toBe(true)
    expect(validateSequenceStepDays(undefined, 'tarea')).toBe(true)
  })
})

describe('repliedSince — detección de respuesta', () => {
  it('inbound posterior a la inscripción cuenta como respuesta', () => {
    expect(repliedSince(iso(2 * DAY_MS), daysAgoIso(1))).toBe(true)
  })

  it('inbound anterior a la inscripción NO detiene', () => {
    expect(repliedSince(daysAgoIso(2), daysAgoIso(1))).toBe(false)
  })

  it('sin inbound nunca detiene', () => {
    expect(repliedSince(null, daysAgoIso(1))).toBe(false)
    expect(repliedSince(undefined, daysAgoIso(1))).toBe(false)
  })
})

interface PageResult {
  docs: Record<string, unknown>[]
  hasNextPage: boolean
}

interface Mocks {
  payload: Payload
  find: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  sendEmail: ReturnType<typeof vi.fn>
}

interface MockOpts {
  tenantsPages?: PageResult[]
  enrollmentsPages?: PageResult[]
  conversationsPages?: PageResult[]
  emailMessagesPages?: PageResult[]
  emailLogDocs?: Record<string, unknown>[]
  tasksDocs?: Record<string, unknown>[]
  sequencesDocs?: Record<string, unknown>[]
  leadsDocs?: Record<string, unknown>[]
}

function buildMockPayload(opts: MockOpts = {}): Mocks {
  const update = vi.fn().mockResolvedValue({})
  const create = vi.fn().mockResolvedValue({})
  const sendEmail = vi.fn().mockResolvedValue({ id: 'resend-1' })
  const find = vi.fn().mockImplementation(({ collection, page }: { collection: string; page?: number }) => {
    const p = (page ?? 1) - 1
    const pagesFor = (pages?: PageResult[]): PageResult => (pages ?? [{ docs: [], hasNextPage: false }])[p] ?? { docs: [], hasNextPage: false }
    if (collection === 'tenants') return Promise.resolve(pagesFor(opts.tenantsPages))
    if (collection === 'sequence-enrollments') return Promise.resolve(pagesFor(opts.enrollmentsPages))
    if (collection === 'conversations') return Promise.resolve(pagesFor(opts.conversationsPages))
    if (collection === 'email-messages') return Promise.resolve(pagesFor(opts.emailMessagesPages))
    if (collection === 'email-log') return Promise.resolve({ docs: opts.emailLogDocs ?? [], hasNextPage: false })
    if (collection === 'tasks') return Promise.resolve({ docs: opts.tasksDocs ?? [], hasNextPage: false })
    if (collection === 'sequences') return Promise.resolve({ docs: opts.sequencesDocs ?? [], hasNextPage: false })
    if (collection === 'leads') return Promise.resolve({ docs: opts.leadsDocs ?? [], hasNextPage: false })
    return Promise.resolve({ docs: [], hasNextPage: false })
  })
  const payload = {
    find,
    update,
    create,
    sendEmail,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as Payload
  return { payload, find, update, create, sendEmail }
}

const LEAD = {
  id: 7,
  fullName: 'Ana Pérez',
  email: 'ana@example.com',
  status: 'contactado',
  convertedClient: null,
  assignedTo: 3,
}

const SEQUENCE = {
  id: 5,
  name: 'Post-cotización',
  active: true,
  steps: [EMAIL_STEP, wait(3), TASK_STEP],
}

function enrollment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 11,
    sequence: { id: 5, name: 'Post-cotización' },
    lead: 7,
    status: 'activa',
    currentStep: 0,
    nextRunAt: daysAgoIso(0.1),
    createdAt: daysAgoIso(1),
    ...overrides,
  }
}

describe('dispatchTenantSequences — barrido por inscripción', () => {
  it('ejecuta el paso email, registra en email-log y agenda la tarea para +3 días', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, emailsSent: 1, emailsFailed: 0, tasksCreated: 0, completed: 0 })
    // Email enviado con personalización {{nombre}} en asunto y cuerpo, log source=sequence
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@example.com', subject: 'Hola Ana' }),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'email-log',
        data: expect.objectContaining({ source: 'sequence', lead: 7 }),
      }),
    )
    // Tras el email viene wait(3) + tarea: currentStep avanza al índice de la tarea
    // (2) y nextRunAt queda agendado a ~3 días.
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'sequence-enrollments',
        id: 11,
        data: expect.objectContaining({ currentStep: 2 }),
      }),
    )
    const updateData = mocks.update.mock.calls.find((c) => c[0].collection === 'sequence-enrollments')?.[0].data as {
      nextRunAt: string
    }
    expect(Date.parse(updateData.nextRunAt) - NOW).toBeGreaterThanOrEqual(3 * DAY_MS - 1000)
  })

  it('ejecuta el paso tarea con source=sequence y asignatario del lead', async () => {
    const taskStep: SequenceStep = { type: 'tarea', taskTitle: 'Llamar a Ana', taskDueInDays: 2 }
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment({ currentStep: 2 })], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, steps: [EMAIL_STEP, wait(3), taskStep] }],
      leadsDocs: [LEAD],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, tasksCreated: 1, completed: 1 })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tasks',
        data: expect.objectContaining({ source: 'sequence', assignedTo: 3, lead: 7, title: 'Llamar a Ana' }),
      }),
    )
    // Último paso → completada
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'sequence-enrollments',
        id: 11,
        data: expect.objectContaining({ status: 'completada' }),
      }),
    )
  })

  it('detiene la secuencia si el lead respondió por WhatsApp después de inscribirse', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      conversationsPages: [
        { docs: [{ lead: 7, lastInboundAt: iso(-DAY_MS / 2) }], hasNextPage: false }, // 12h después de inscribir
      ],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, stopped: 1, emailsSent: 0 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'sequence-enrollments',
        id: 11,
        data: expect.objectContaining({ status: 'respondida' }),
      }),
    )
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('detiene la secuencia si llegó un inbound email del lead (EmailMessages)', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      emailMessagesPages: [
        { docs: [{ lead: 7, date: iso(-DAY_MS / 2), direction: 'inbound' }], hasNextPage: false },
      ],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, stopped: 1 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'respondida' }),
      }),
    )
  })

  it('cancela si el lead fue convertido o descartado', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [{ ...LEAD, convertedClient: 42 }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, stopped: 1 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancelada' }),
      }),
    )
  })

  it('no duplica el email si el log ya registra el envío de esta inscripción', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      emailLogDocs: [{ id: 90, subject: 'Hola Ana', status: 'sent' }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    // Reintento idempotente: no reenvía, pero SÍ avanza la inscripción.
    expect(res).toMatchObject({ processed: 1, emailsSent: 0, emailsFailed: 0 })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'sequence-enrollments',
        id: 11,
        data: expect.objectContaining({ currentStep: 2 }),
      }),
    )
  })

  it('no duplica la tarea si ya existe para el lead', async () => {
    const taskStep: SequenceStep = { type: 'tarea', taskTitle: 'Llamar a Ana', taskDueInDays: 2 }
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment({ currentStep: 2 })], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, steps: [EMAIL_STEP, wait(3), taskStep] }],
      leadsDocs: [LEAD],
      tasksDocs: [{ id: 9, title: 'Llamar a Ana', source: 'sequence' }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, tasksCreated: 0, completed: 1 })
    expect(mocks.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tasks' }),
    )
  })

  it('omite inscripciones de secuencias inactivas sin cambiar estado', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, active: false }],
      leadsDocs: [LEAD],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res.processed).toBe(1)
    expect(res.emailsSent).toBe(0)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('omite el paso email si el lead no tiene email y avanza', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment({ currentStep: 2 })], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, steps: [EMAIL_STEP, wait(1), TASK_STEP] }],
      leadsDocs: [{ ...LEAD, email: null }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    // emailsFailed cuenta fallos del proveedor; saltar por falta de email no es fallo.
    expect(res).toMatchObject({ processed: 1, emailsFailed: 0, tasksCreated: 1, completed: 1 })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('dispatch-sequences — handler del job', () => {
  it('itera tenants (paginado) y agrega totales', async () => {
    const mocks = buildMockPayload({
      tenantsPages: [
        { docs: [{ id: 1, name: 'T1' }], hasNextPage: true },
        { docs: [{ id: 2, name: 'T2' }], hasNextPage: false },
      ],
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
    })

    if (typeof dispatchSequencesTask.handler !== 'function') {
      throw new Error('dispatchSequencesTask.handler must be a function')
    }
    type TaskArgs = Parameters<
      Extract<typeof dispatchSequencesTask.handler, (...args: never[]) => unknown>
    >[0]
    const result = (await dispatchSequencesTask.handler({
      req: { payload: mocks.payload },
    } as unknown as TaskArgs)) as {
      output: { processed: number; emailsSent: number; summary: string }
    }

    // 2 tenants × 1 inscripción = 2 emails
    expect(result.output).toMatchObject({ processed: 2, emailsSent: 2 })
    expect(result.output.summary).toContain('Procesadas: 2')
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'tenants', page: 2 }))
  })
})
