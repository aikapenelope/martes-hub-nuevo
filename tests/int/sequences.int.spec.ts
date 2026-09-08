import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import {
  dispatchTenantSequences,
  makeSequenceStepRequiredValidator,
  peekNextAction,
  repliedSince,
  stepsChangedStructurally,
  validateSequenceStepDays,
  type SequenceStep,
} from '@/lib/sequences'
import { dispatchSequencesTask } from '@/jobs/dispatchSequences'
import { safeInternalRedirect } from '@/lib/internal-redirect'

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

describe('makeSequenceStepRequiredValidator — contenido por tipo (Devin #104 SEC-2)', () => {
  const subjectValidator = makeSequenceStepRequiredValidator('un asunto', ['email'])
  const titleValidator = makeSequenceStepRequiredValidator('un título', ['tarea'])

  it('paso email exige asunto', () => {
    expect(subjectValidator('Hola', { siblingData: { type: 'email' } })).toBe(true)
    expect(subjectValidator('   ', { siblingData: { type: 'email' } })).not.toBe(true)
    expect(subjectValidator(undefined, { siblingData: { type: 'email' } })).toMatch(/asunto/)
  })

  it('paso tarea exige título; email no', () => {
    expect(titleValidator(undefined, { siblingData: { type: 'tarea' } })).toMatch(/título/)
    expect(titleValidator('Llamar', { siblingData: { type: 'tarea' } })).toBe(true)
    expect(subjectValidator(undefined, { siblingData: { type: 'tarea' } })).toBe(true)
  })

  it('paso esperar no exige contenido de email ni tarea', () => {
    expect(subjectValidator(undefined, { siblingData: { type: 'esperar' } })).toBe(true)
    expect(titleValidator(undefined, { siblingData: { type: 'esperar' } })).toBe(true)
  })
})

describe('stepsChangedStructurally — edición segura de pasos (Devin #104-5)', () => {
  const original = [
    { id: 'a', type: 'email', subject: 'Hola' },
    { id: 'b', type: 'esperar', days: 3 },
  ]

  it('editar contenido de un paso existente NO es estructural', () => {
    expect(
      stepsChangedStructurally(original, [
        { id: 'a', type: 'email', subject: 'Hola editado' },
        { id: 'b', type: 'esperar', days: 5 },
      ]),
    ).toBe(false)
  })

  it('agregar, quitar, reordenar o cambiar tipo SÍ es estructural', () => {
    expect(stepsChangedStructurally(original, [...original, { id: 'c', type: 'tarea' }])).toBe(true)
    expect(stepsChangedStructurally(original, [original[0]])).toBe(true)
    expect(stepsChangedStructurally(original, [original[1], original[0]])).toBe(true)
    expect(stepsChangedStructurally(original, [{ id: 'a', type: 'tarea' }, original[1]])).toBe(true)
  })

  it('un update sin steps (o sin baseline) no se considera cambio estructural', () => {
    expect(stepsChangedStructurally(original, undefined)).toBe(false)
    expect(stepsChangedStructurally(undefined, original)).toBe(false)
  })
})

describe('safeInternalRedirect — solo rutas internas (Devin #104 SEC-1)', () => {
  it('acepta paths internos con query', () => {
    expect(safeInternalRedirect('/workspace/crm/leads/3')).toBe('/workspace/crm/leads/3')
    expect(safeInternalRedirect('/workspace/crm?tab=x')).toBe('/workspace/crm?tab=x')
  })

  it('rechaza URLs externas, protocol-relative, esquemas y backslashes', () => {
    const fallback = '/workspace/crm'
    expect(safeInternalRedirect('https://evil.com')).toBe(fallback)
    expect(safeInternalRedirect('//evil.com')).toBe(fallback)
    expect(safeInternalRedirect('javascript:alert(1)')).toBe(fallback)
    expect(safeInternalRedirect('/\\evil.com')).toBe(fallback)
    expect(safeInternalRedirect('/ruta:x')).toBe(fallback)
    expect(safeInternalRedirect('')).toBe(fallback)
    expect(safeInternalRedirect(null)).toBe(fallback)
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
  /** El claim/update condicional de la inscripción no matchea (cancelada en el ínterin). */
  enrollmentLost?: boolean
}

function buildMockPayload(opts: MockOpts = {}): Mocks {
  const update = vi.fn().mockResolvedValue({ docs: opts.enrollmentLost ? [] : [{}] })
  const create = vi.fn().mockResolvedValue({ id: 77 })
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
    stepAttempts: 0,
    nextRunAt: daysAgoIso(0.1),
    createdAt: daysAgoIso(1),
    ...overrides,
  }
}

/** Última escritura condicional sobre la inscripción (el avance/reprogramación). */
function lastEnrollmentUpdate(mocks: Mocks): { where: Record<string, unknown>; data: Record<string, unknown> } {
  const calls = mocks.update.mock.calls.filter((c) => c[0].collection === 'sequence-enrollments')
  return calls[calls.length - 1]?.[0]
}

describe('dispatchTenantSequences — barrido por inscripción', () => {
  it('reclama la inscripción, ejecuta el paso email y agenda la tarea para +3 días', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, emailsSent: 1, emailsFailed: 0, tasksCreated: 0, completed: 0 })
    // Email enviado con personalización {{nombre}} en asunto y cuerpo
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@example.com', subject: 'Hola Ana' }),
    )
    // Marcador queued ANTES del proveedor, con identidad (inscripción, paso)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'email-log',
        data: expect.objectContaining({
          source: 'sequence',
          lead: 7,
          status: 'queued',
          sequenceEnrollmentId: 11,
          sequenceStepIndex: 0,
        }),
      }),
    )
    // Confirmación del marcador a 'sent' tras el envío
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'email-log',
        id: 77,
        data: expect.objectContaining({ status: 'sent' }),
      }),
    )
    // Tras el email viene wait(3) + tarea: currentStep avanza al índice de la tarea
    // (2) y nextRunAt queda agendado a ~3 días.
    const advance = lastEnrollmentUpdate(mocks)
    expect(advance.data).toEqual(expect.objectContaining({ currentStep: 2, stepAttempts: 0 }))
    expect(advance.where).toEqual(
      expect.objectContaining({
        and: expect.arrayContaining([
          { id: { equals: 11 } },
          { status: { equals: 'activa' } },
        ]),
      }),
    )
    expect(Date.parse(advance.data.nextRunAt as string) - NOW).toBeGreaterThanOrEqual(3 * DAY_MS - 1000)
  })

  it('ejecuta el paso tarea con source=sequence, identidad y asignatario del lead', async () => {
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
        data: expect.objectContaining({
          source: 'sequence',
          assignedTo: 3,
          lead: 7,
          title: 'Llamar a Ana',
          sequenceEnrollmentId: 11,
          sequenceStepIndex: 2,
        }),
      }),
    )
    // Último paso → completada
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ status: 'completada' }))
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
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ status: 'respondida' }))
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
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ status: 'respondida' }))
  })

  it('cancela si el lead fue convertido o descartado', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [{ ...LEAD, convertedClient: 42 }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ processed: 1, stopped: 1 })
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ status: 'cancelada' }))
  })

  it('no reenvía y solo avanza si el marcador (inscripción, paso) ya está en sent', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      emailLogDocs: [
        { id: 90, sequenceEnrollmentId: 11, sequenceStepIndex: 0, status: 'sent', subject: 'Hola Ana' },
      ],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    // Reintento idempotente: no reenvía, pero SÍ avanza la inscripción.
    expect(res).toMatchObject({ processed: 1, emailsSent: 0, emailsFailed: 0 })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ currentStep: 2 }))
  })

  it('no reenvía si el marcador quedó queued (envío reclamado sin confirmación)', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      emailLogDocs: [{ id: 91, sequenceEnrollmentId: 11, sequenceStepIndex: 0, status: 'queued' }],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res.emailsSent).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(lastEnrollmentUpdate(mocks).data).toEqual(expect.objectContaining({ currentStep: 2 }))
  })

  it('pasos email con el MISMO asunto no se suprimen entre sí (identidad por índice)', async () => {
    const second: SequenceStep = { type: 'email', subject: 'Hola {{nombre}}', bodyHtml: '<p>De nuevo</p>' }
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, steps: [EMAIL_STEP, wait(1), second] }],
      leadsDocs: [LEAD],
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    // Solo se ejecuta UN paso por pasada, pero el marcador del paso 0 no
    // bloquea al paso 2 en su pasada: cada paso tiene su propia identidad.
    expect(res.emailsSent).toBe(1)
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'email-log',
        data: expect.objectContaining({ sequenceStepIndex: 0 }),
      }),
    )
  })

  it('email fallido: NO avanza, marca failed y reprograma con reintento acotado', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
    })
    mocks.sendEmail.mockRejectedValue(new Error('provider down'))

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res).toMatchObject({ emailsSent: 0, emailsFailed: 1, completed: 0 })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'email-log',
        id: 77,
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
    const advance = lastEnrollmentUpdate(mocks)
    expect(advance.data).toEqual(expect.objectContaining({ stepAttempts: 1 }))
    expect(advance.data.currentStep).toBeUndefined()
    // Reprogramada ~1h desde AHORA (no 3 días: no consumió las esperas del
    // paso siguiente). El dispatcher usa el reloj real, no el NOW del test.
    const retryDelta = Date.parse(advance.data.nextRunAt as string) - Date.now()
    expect(retryDelta).toBeGreaterThanOrEqual(60 * 60 * 1000 - 5000)
    expect(retryDelta).toBeLessThan(2 * 60 * 60 * 1000)
  })

  it('reintentos agotados (stepAttempts=2): política terminal, la inscripción avanza igual', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment({ stepAttempts: 2 })], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
    })
    mocks.sendEmail.mockRejectedValue(new Error('provider down'))

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res.emailsFailed).toBe(1)
    const advance = lastEnrollmentUpdate(mocks)
    expect(advance.data).toEqual(expect.objectContaining({ currentStep: 2, stepAttempts: 0 }))
  })

  it('no envía si la inscripción fue cancelada durante la lectura (claim falla)', async () => {
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment()], hasNextPage: false }],
      sequencesDocs: [SEQUENCE],
      leadsDocs: [LEAD],
      enrollmentLost: true,
    })

    const res = await dispatchTenantSequences({ payload: mocks.payload, tenantId: 1 })

    expect(res.emailsSent).toBe(0)
    expect(res.tasksCreated).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('no duplica la tarea si el marcador de identidad ya existe', async () => {
    const taskStep: SequenceStep = { type: 'tarea', taskTitle: 'Llamar a Ana', taskDueInDays: 2 }
    const mocks = buildMockPayload({
      enrollmentsPages: [{ docs: [enrollment({ currentStep: 2 })], hasNextPage: false }],
      sequencesDocs: [{ ...SEQUENCE, steps: [EMAIL_STEP, wait(3), taskStep] }],
      leadsDocs: [LEAD],
      tasksDocs: [
        { id: 9, title: 'Llamar a Ana', source: 'sequence', sequenceEnrollmentId: 11, sequenceStepIndex: 2 },
      ],
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
