import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { dispatchConversationReply, resolveReplyService } from '@/lib/message-dispatch'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const sendTextMock = vi.fn()
vi.mock('@/integrations/openbsp/client', () => ({
  sendText: (...args: unknown[]) => sendTextMock(...args),
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
  const payload = {
    logger: { error: vi.fn(), warn: vi.fn() },
    find: vi.fn(({ collection }: { collection: string }) => {
      if (collection === 'tenants') return Promise.resolve({ docs: [{ id: 1 }], totalDocs: 1 })
      if (collection === 'messages') return Promise.resolve({ docs: messages, totalDocs: messages.length })
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
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp_web'), text: 'hola' })
    expect(res.ok).toBe(false)
    expect((res as { error: string }).error).toContain('whatsapp_web')
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it('envía whatsapp con service y senderAddress de la conversación', async () => {
    conversation = makeConversation('whatsapp')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola' })
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'whatsapp', senderAddress: '883555001', to: '584120001122' }),
    )
  })

  it('envía instagram_dm con service instagram_dm', async () => {
    conversation = makeConversation('instagram_dm')
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('instagram_dm'), text: 'hola' })
    expect(res.ok).toBe(true)
    expect(sendTextMock).toHaveBeenCalledWith(expect.objectContaining({ service: 'instagram_dm' }))
  })

  it('fuera de la ventana 24h devuelve needsTemplate sin enviar', async () => {
    const { payload } = makePayloadFactory()
    ctx.payload = payload
    const res = await dispatchConversationReply(ctx, {
      conversation: makeConversation('whatsapp', { lastInboundAt: new Date(Date.now() - 25 * 3600_000).toISOString() }),
      text: 'hola',
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
    const res = await dispatchConversationReply(ctx, { conversation: makeConversation('whatsapp'), text: 'hola' })
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
      json: async () => ({ conversationId: 1, text: 'hola' }),
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
    return quickReplyLeadChatAction(5, 'hola')
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
