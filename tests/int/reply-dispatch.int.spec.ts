import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { dispatchConversationReply, resolveReplyService } from '@/lib/message-dispatch'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const sendTextMock = vi.fn()
const findMessageByIdMock = vi.fn()
vi.mock('@/integrations/openbsp/client', () => ({
  sendText: (...args: unknown[]) => sendTextMock(...args),
  findMessageById: (...args: unknown[]) => findMessageByIdMock(...args),
  toDeterministicUuid: (seed: string) => 'uuid-' + seed.slice(-8),
}))

const rateLimitMock = vi.fn()
vi.mock('@/endpoints/rateLimit', () => ({
  checkUserActionRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}))

vi.mock('@/lib/workspace-context', () => ({ getWorkspaceContext: vi.fn() }))
vi.mock('@/lib/crm-scoped-entities', () => ({ getScopedLead: vi.fn() }))

let conversation: Record<string, unknown> = {}

function makePayloadFactory({ messages = [] as Array<Record<string, unknown>> } = {}) {
  const updates: Array<{ collection: string; id: number; data: Record<string, unknown> }> = []
  const created: Array<Record<string, unknown>> = []
  const deleted: number[] = []
  const payload = {
    logger: { error: vi.fn(), warn: vi.fn() },
    find: vi.fn(({ collection, where }: { collection: string; where?: { and?: Array<Record<string, Record<string, unknown>>> } }) => {
      if (collection === 'tenants') return Promise.resolve({ docs: [{ id: 1 }], totalDocs: 1 })
      if (collection === 'messages') {
        if (where?.and) {
          const convFilter = where.and.find((c) => 'conversation' in c)?.conversation?.equals
          const ikFilter = where.and.find((c) => 'idempotencyKey' in c)?.idempotencyKey?.equals
          if (convFilter !== undefined || ikFilter !== undefined) {
            const matched = messages.filter((m) => {
              if (convFilter !== undefined && m.conversation !== convFilter) return false
              const ik = (m.statusJson as Record<string, unknown> | undefined)?.idempotencyKey ?? m.idempotencyKey
              if (ikFilter !== undefined && ik !== ikFilter) return false
              return true
            })
            return Promise.resolve({ docs: matched, totalDocs: matched.length })
          }
        }
        return Promise.resolve({ docs: messages, totalDocs: messages.length })
      }
      if (collection === 'conversations') return Promise.resolve({ docs: [conversation], totalDocs: 1 })
      return Promise.resolve({ docs: [], totalDocs: 0 })
    }),
    findByID: vi.fn(() => Promise.resolve(conversation)),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: 100 + created.length + 1, ...data }
      created.push(doc)
      return Promise.resolve(doc)
    }),
    update: vi.fn(({ collection, id, data }: { collection: string; id: number; data: Record<string, unknown> }) => {
      updates.push({ collection, id, data })
      return Promise.resolve({ id, ...data })
    }),
    delete: vi.fn(({ id }: { id: number }) => {
      deleted.push(id)
      return Promise.resolve({ id })
    }),
  } as unknown as Payload
  return { payload, updates, created }
}

function makeConversation(channel: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    channel,
    contactAddress: '584120001122',
    organizationAddress: '883555001',
    lastInboundAt: new Date().toISOString(),
    tenant: 1,
    ...overrides,
  } as never
}

function makeUser(): User {
  return { id: 7, email: 'agent@martes.local', roles: ['admin'] } as unknown as User
}

const ctx = { payload: undefined as unknown as Payload, user: makeUser(), tenantId: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  sendTextMock.mockResolvedValue({ id: 'wamid.X', external_id: 'wamid.X', status: {} })
  findMessageByIdMock.mockResolvedValue(null)
  rateLimitMock.mockResolvedValue(true)
})

describe('resolveReplyService — cobertura de todos los canales', () => {
  it('acepta whatsapp e instagram_dm', () => {
    expect(resolveReplyService('whatsapp')).toEqual({ service: 'whatsapp' })
    expect(resolveReplyService('instagram_dm')).toEqual({ service: 'instagram_dm' })
  })

  it('rechaza whatsapp_web, web y local (sin transporte de salida)', () => {
    for (const channel of ['whatsapp_web', 'web', 'local']) {
      const res = resolveReplyService(channel)
      expect('error' in res && res.error).toContain('no admite respuestas')
    }
  })
})

describe('dispatchConversationReply — helper compartido', () => {
  it('rechaza whatsapp_web sin llamar a sendText', async () => {
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp_web'), text: 'hola', idempotencyKey: 'ik-1' })
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toContain('whatsapp_web')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('envía whatsapp con service y senderAddress de la conversación', async () => {
    conversation = makeConversation('whatsapp')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'ik-2' })
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'whatsapp', senderAddress: '883555001', to: '584120001122' }),
    )
  })

  it('envía instagram_dm con service instagram_dm', async () => {
    conversation = makeConversation('instagram_dm')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('instagram_dm'), text: 'hola', idempotencyKey: 'ik-3' })
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'instagram_dm' }))
  })

  it('fuera de la ventana 24h devuelve needsTemplate sin enviar', async () => {
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp', { lastInboundAt: new Date(Date.now() - 25 * 3600_000).toISOString() }),
      text: 'hola',
      idempotencyKey: 'ik-window',
    })
    expect(res.ok).toBe(false)
    expect((res as { needsTemplate?: boolean }).needsTemplate).toBe(true)
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('idempotencia: clave ya despachada devuelve el mismo messageId sin reenviar', async () => {
    conversation = makeConversation('whatsapp')
    const seeded = [
      { id: 42, tenant: 1, conversation: 1, openbspId: 'wamid.Y', statusJson: { idempotencyKey: 'K1', dispatchStatus: 'dispatched' } },
    ]
    const { payload } = makePayloadFactory({ messages: seeded })
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'K1' })
    expect(res.ok).toBe(true)
    expect((res as { messageId: number }).messageId).toBe(42)
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('fallo de sendText marca el registro failed y devuelve error', async () => {
    conversation = makeConversation('whatsapp')
    sendTextMock.mockRejectedValue(new Error('OpenBSP no configurado: faltan env'))
    const { payload, updates } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'ik-4' })
    expect(res.ok).toBe(false)
    expect((res as { notConfigured?: boolean }).notConfigured).toBe(true)
    const failed = updates.find((u) => u.data.statusJson && (u.data.statusJson as Record<string, unknown>).dispatchStatus === 'failed')
    expect(failed).toBeDefined()
  })
})

describe('replyConversationHandler — cobertura de canales en la ruta del endpoint', () => {
  async function callHandler(channel: string) {
    conversation = makeConversation(channel)
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const { replyConversationHandler } = await import('@/endpoints/replyConversation')
    const req = {
      user: makeUser(),
      json: async () => ({ conversationId: 1, text: 'hola', idempotencyKey: 'ik-endpoint-' + channel }),
      headers: { get: () => 'Bearer x' },
      payload,
    }
    return replyConversationHandler(req as never)
  }

  it('whatsapp → 200 y envío con service correcto', async () => {
    const res = await callHandler('whatsapp')
    expect(res.status).toBe(200)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'whatsapp' }))
  })

  it('instagram_dm → 200 con service instagram_dm', async () => {
    const res = await callHandler('instagram_dm')
    expect(res.status).toBe(200)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'instagram_dm' }))
  })

  it('whatsapp_web → 422 sin envío', async () => {
    const res = await callHandler('whatsapp_web')
    expect(res.status).toBe(422)
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('caller REST sin idempotencyKey genera clave en servidor y responde 200', async () => {
    conversation = makeConversation('whatsapp')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const { replyConversationHandler } = await import('@/endpoints/replyConversation')
    const req = {
      user: makeUser(),
      json: async () => ({ conversationId: 1, text: 'hola' }),
      headers: { get: () => 'Bearer x' },
      payload,
    }
    const res = await replyConversationHandler(req as never)
    expect(res.status).toBe(200)
    expect(sendTextMock).toHaveBeenCalled()
  })

  it('idempotencyKey mayor a 200 caracteres devuelve 400', async () => {
    conversation = makeConversation('whatsapp')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const { replyConversationHandler } = await import('@/endpoints/replyConversation')
    const req = {
      user: makeUser(),
      json: async () => ({ conversationId: 1, text: 'hola', idempotencyKey: 'x'.repeat(201) }),
      headers: { get: () => 'Bearer x' },
      payload,
    }
    const res = await replyConversationHandler(req as never)
    expect(res.status).toBe(400)
    expect(sendTextMock).not.toHaveBeenCalled()
  })
})

describe('quickReplyLeadChatAction — cobertura de canales en la ruta del pipeline', () => {
  function makeContextLike(payload: Payload) {
    return {
      payload,
      user: ctx.user,
      tenantId: 1,
      tenant: { id: 1 },
      canEdit: true,
      isAdmin: true,
      roles: ['admin'],
    }
  }

  async function callAction(channel: string) {
    conversation = makeConversation(channel)
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const { getWorkspaceContext } = await import('@/lib/workspace-context')
    ;(getWorkspaceContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeContextLike(payload))
    const { getScopedLead } = await import('@/lib/crm-scoped-entities')
    ;(getScopedLead as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      lead: { id: 5, fullName: 'Lead Test', status: 'nuevo' },
      context: makeContextLike(payload),
    })
    const { quickReplyLeadChatAction } = await import('@/lib/crm-pipeline-actions')
    return quickReplyLeadChatAction(5, 'hola', 'ik-pipeline-' + channel)
  }

  it('whatsapp → ok con envío service whatsapp', async () => {
    const res = await callAction('whatsapp')
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'whatsapp' }))
  })

  it('instagram_dm → ok con service instagram_dm', async () => {
    const res = await callAction('instagram_dm')
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'instagram_dm' }))
  })

  it('whatsapp_web → rechazado sin envío (consistente con inbox)', async () => {
    const res = await callAction('whatsapp_web')
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('no admite respuestas')
    expect(sendTextMock).not.toHaveBeenCalled()
  })
})

describe('dispatchConversationReply — seguridad y claims concurrentes', () => {
  it('rechaza conversación de otro tenant (validación en el despachador)', async () => {
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp', { tenant: 2 }),
      text: 'hola',
      idempotencyKey: 'ik-cross',
    })
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('no pertenece al tenant activo')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('claim en vuelo (sending fresco) devuelve error sin reenviar', async () => {
    conversation = makeConversation('whatsapp')
    const seeded = [
      {
        id: 50,
        tenant: 1,
        conversation: 1,
        openbspId: 'pending:K2',
        statusJson: { idempotencyKey: 'K2', dispatchStatus: 'sending', sentAt: new Date().toISOString() },
      },
    ]
    const { payload } = makePayloadFactory({ messages: seeded })
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'K2' })
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('en proceso de envío')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('rechaza idempotencyKey vacía o que excede 200 caracteres', async () => {
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const resEmpty = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: '   ',
    })
    expect(resEmpty.ok).toBe(false)
    expect((resEmpty as { error?: string }).error).toContain('idempotencyKey')

    const resTooLong = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: 'x'.repeat(201),
    })
    expect(resTooLong.ok).toBe(false)
    expect((resTooLong as { error?: string }).error).toContain('200')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('claves idénticas en conversaciones distintas no interfieren entre sí (scoped lookup)', async () => {
    const seeded = [
      {
        id: 99,
        tenant: 1,
        conversation: 2, // Otra conversación
        openbspId: 'wamid.OTHER',
        statusJson: { idempotencyKey: 'shared-key', dispatchStatus: 'dispatched' },
      },
    ]
    const { payload } = makePayloadFactory({ messages: seeded })
    ctx.payload = payload
    // Enviamos a la conversación 1 usando la misma clave 'shared-key'
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp', { id: 1 }),
      text: 'hola conv 1',
      idempotencyKey: 'shared-key',
    })
    expect(res.ok).toBe(true)
    // No debe reutilizar el messageId 99 de la conversación 2
    expect((res as { messageId: number }).messageId).not.toBe(99)
    expect(sendTextMock).toHaveBeenCalled()
  })

  it('claim obsoleto (>2 min) se recupera y despacha si OpenBSP confirma ausencia del mensaje', async () => {
    conversation = makeConversation('whatsapp')
    const seeded = [
      {
        id: 51,
        tenant: 1,
        conversation: 1,
        openbspId: 'pending:K3',
        statusJson: { idempotencyKey: 'K3', dispatchStatus: 'sending', sentAt: new Date(Date.now() - 5 * 60_000).toISOString() },
      },
    ]
    findMessageByIdMock.mockResolvedValueOnce(null)
    const { payload } = makePayloadFactory({ messages: seeded })
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'K3' })
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalled()
  })

  it('claim obsoleto (>2 min) que ya existe en OpenBSP se reconcilia sin reenviar', async () => {
    conversation = makeConversation('whatsapp')
    const seeded = [
      {
        id: 52,
        tenant: 1,
        conversation: 1,
        openbspId: 'pending:K-stale',
        statusJson: { idempotencyKey: 'K-stale', dispatchStatus: 'sending', sentAt: new Date(Date.now() - 5 * 60_000).toISOString() },
      },
    ]
    findMessageByIdMock.mockResolvedValueOnce({ id: 'openbsp-recovered-1', external_id: 'wamid.rec', status: {} })
    const { payload } = makePayloadFactory({ messages: seeded })
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'K-stale' })
    expect(res.ok).toBe(true)
    expect((res as { messageId: number }).messageId).toBe(52)
    // No debe haber llamado a sendText porque OpenBSP ya tenía el mensaje
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('error de transporte ambiguo donde OpenBSP sí aceptó el mensaje se reconcilia a dispatched sin fallar', async () => {
    conversation = makeConversation('whatsapp')
    sendTextMock.mockRejectedValueOnce(new TypeError('fetch failed: connection reset'))
    findMessageByIdMock.mockResolvedValueOnce({ id: 'openbsp-msg-accepted', external_id: 'wamid.acc', status: {} })
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: 'ik-ambiguous-ok',
    })
    expect(res.ok).toBe(true)
  })

  it('error de transporte donde OpenBSP no lo recibió marca failed', async () => {
    conversation = makeConversation('whatsapp')
    sendTextMock.mockRejectedValueOnce(new TypeError('fetch failed: timeout'))
    findMessageByIdMock.mockResolvedValueOnce(null)
    const { payload, updates } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: 'ik-ambiguous-fail',
    })
    expect(res.ok).toBe(false)
    const failedUpdate = updates.find(
      (u) => (u.data.statusJson as Record<string, unknown> | undefined)?.dispatchStatus === 'failed',
    )
    expect(failedUpdate).toBeDefined()
  })

  it('error de transporte donde OpenBSP no responde mantiene sending y devuelve error transitorio', async () => {
    conversation = makeConversation('whatsapp')
    sendTextMock.mockRejectedValueOnce(new TypeError('fetch failed: ETIMEDOUT'))
    findMessageByIdMock.mockRejectedValueOnce(new Error('OpenBSP 503 Service Unavailable'))
    const { payload, updates } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: 'ik-provider-down',
    })
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('verificando el estado del envío')
    const sendingUpdate = updates.find(
      (u) => (u.data.statusJson as Record<string, unknown> | undefined)?.dispatchStatus === 'sending',
    )
    expect(sendingUpdate).toBeDefined()
  })

  it('fallo en la transición atómica a sending aborta el despacho sin llamar a sendText', async () => {
    conversation = makeConversation('whatsapp')
    const seeded = [
      {
        id: 53,
        tenant: 1,
        conversation: 1,
        openbspId: 'pending:K-fail-transition',
        statusJson: { idempotencyKey: 'K-fail-transition', dispatchStatus: 'failed' },
      },
    ]
    const { payload } = makePayloadFactory({ messages: seeded })
    findMessageByIdMock.mockResolvedValueOnce(null)
    // El update para transicionar a sending falla
    ;(payload.update as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB Lock timeout'))
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp'),
      text: 'hola',
      idempotencyKey: 'K-fail-transition',
    })
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('No se pudo actualizar el estado de envío')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('duplicado de claim (create lanza unique) resuelve por el ganador despachado sin reenviar', async () => {
    conversation = makeConversation('whatsapp')
    const { payload } = makePayloadFactory()
    // create SIEMPRE lanza violación unique: el claim fue ganado por otra petición
    ;(payload.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('duplicate key value violates unique constraint "messages_conversation_idempotency_uidx"'),
    )
    payload.find = vi.fn(({ collection }: { collection: string }) => {
      if (collection === 'tenants') return Promise.resolve({ docs: [{ id: 1 }], totalDocs: 1 })
      if (collection === 'messages')
        return Promise.resolve({
          docs: [{ id: 77, tenant: 1, conversation: 1, openbspId: 'wamid.W', statusJson: { idempotencyKey: 'ik-dup', dispatchStatus: 'dispatched' } }],
          totalDocs: 1,
        })
      return Promise.resolve({ docs: [], totalDocs: 0 })
    }) as unknown as Payload['find']
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola', idempotencyKey: 'ik-dup' })
    expect(res.ok).toBe(true)
    expect((res as { messageId: number }).messageId).toBe(77)
    expect(sendTextMock).not.toHaveBeenCalled()
  })
})
