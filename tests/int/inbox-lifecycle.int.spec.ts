import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { getPayload, type Payload } from 'payload'
import configPromise from '@/payload.config'
import type { Tenant, User, Conversation } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import {
  replyConversationAction,
  updateConversationMetaAction,
  addConversationNoteAction,
  summarizeConversationWithAiAction,
} from '@/lib/inbox-actions'
import { DEFAULT_QUICK_SNIPPETS } from '@/components/workspace/inbox/inbox-snippets'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
}))

vi.mock('@/lib/ai-provider', () => ({
  getTenantAiModel: vi.fn().mockResolvedValue({
    model: 'mock-model',
  }),
}))

vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      summary: 'Resumen de prueba de IA',
      sentiment: 'positivo',
      objections: 'Ninguna',
      nextSteps: 'Enviar presupuesto',
    },
  }),
}))

vi.mock('@/integrations/openbsp/client', () => ({
  sendText: vi.fn().mockResolvedValue({
    id: 'mock-openbsp-msg-123',
    external_id: 'mock-ext-123',
    status: { sent_at: new Date().toISOString() },
  }),
}))

describe('Inbox Omnicanal Unificado 360° (Inbox Lifecycle)', { timeout: 35000 }, () => {
  let payload: Payload
  let user: User
  let tenant1: Tenant
  let tenant2: Tenant

  beforeAll(async () => {
    payload = await getPayload({ config: configPromise })

    const userDoc = (await payload.find({ collection: 'users', limit: 1 })).docs[0]
    expect(userDoc).toBeDefined()
    user = userDoc

    const tenantDocs = (await payload.find({ collection: 'tenants', limit: 2 })).docs
    expect(tenantDocs.length).toBeGreaterThanOrEqual(1)
    tenant1 = tenantDocs[0]

    if (tenantDocs.length > 1) {
      tenant2 = tenantDocs[1]
    } else {
      tenant2 = await payload.create({
        collection: 'tenants',
        data: {
          name: 'Tenant Inbox Secundario ' + Date.now(),
          slug: 'tenant-inbox-sec-' + Date.now(),
        },
      })
    }
  }, 40000)

  beforeEach(() => {
    vi.mocked(getWorkspaceContext).mockResolvedValue({
      payload,
      user,
      tenantId: tenant1.id,
      canEdit: true,
      roles: ['admin'],
    } as unknown as Awaited<ReturnType<typeof getWorkspaceContext>>)
  })

  describe('Quick Snippets Locales', () => {
    it('incluye los snippets de negocio predeterminados sin depender de Meta', () => {
      expect(DEFAULT_QUICK_SNIPPETS.length).toBeGreaterThanOrEqual(5)
      const shortcuts = DEFAULT_QUICK_SNIPPETS.map((s) => s.shortcut)
      expect(shortcuts).toContain('/saludo')
      expect(shortcuts).toContain('/pago')
      expect(shortcuts).toContain('/horario')

      for (const snippet of DEFAULT_QUICK_SNIPPETS) {
        expect(snippet.text.length).toBeGreaterThan(10)
        expect(snippet.label.length).toBeGreaterThan(2)
      }
    })
  })

  describe('replyConversationAction', () => {
    it('envía respuesta y registra el mensaje en el hilo dentro de la ventana de 24h', async () => {
      const now = new Date()
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584120001122',
          channel: 'whatsapp',
          status: 'open',
          lastInboundAt: now.toISOString(),
          lastMessageAt: now.toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await replyConversationAction(
        conversation.id,
        '¡Hola! Te confirmamos que hemos recibido tu solicitud.',
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.messageId).toBeDefined()

      // Verificar que el mensaje existe en la base de datos
      const messageDoc = await payload.findByID({
        collection: 'messages',
        id: result.messageId,
        overrideAccess: true,
      })
      expect(messageDoc).toBeDefined()
      expect(messageDoc.direction).toBe('outbound')
      expect(messageDoc.text).toBe('¡Hola! Te confirmamos que hemos recibido tu solicitud.')

      // Verificar que la conversación actualizó lastMessageAt
      const updatedConv = await payload.findByID({
        collection: 'conversations',
        id: conversation.id,
        overrideAccess: true,
      })
      expect(updatedConv.lastMessageAt).toBeDefined()
    })

    it('bloquea el envío si la ventana de 24 horas de Meta ha vencido', async () => {
      const expiredTime = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584129998877',
          channel: 'whatsapp',
          status: 'open',
          lastInboundAt: expiredTime,
          lastMessageAt: expiredTime,
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await replyConversationAction(
        conversation.id,
        'Mensaje que debe fallar por ventana expirada',
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.needsTemplate).toBe(true)
        expect(result.error).toContain('ventana de 24h')
      }
    })

    it('aislamiento multi-tenant: no permite responder a conversaciones de otro tenant', async () => {
      const convOtherTenant = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584145556677',
          channel: 'whatsapp',
          status: 'open',
          lastInboundAt: new Date().toISOString(),
          tenant: tenant2.id,
        },
      })) as Conversation

      const result = await replyConversationAction(convOtherTenant.id, 'Hola')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('tenant activo')
      }
    })

    it('enruta respuestas según conversation.channel para instagram_dm', async () => {
      const { sendText } = await import('@/integrations/openbsp/client')
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: 'ig_user_12345',
          channel: 'instagram_dm',
          status: 'open',
          lastInboundAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await replyConversationAction(conversation.id, 'Hola desde Instagram DM')
      expect(result.ok).toBe(true)
      expect(sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ig_user_12345',
          service: 'instagram_dm',
          text: 'Hola desde Instagram DM',
        }),
      )
    })

    it('rechaza canales no soportados para respuestas automáticas', async () => {
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: 'web_session_999',
          channel: 'whatsapp_web',
          status: 'open',
          lastInboundAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await replyConversationAction(conversation.id, 'Mensaje no soportado')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('no admite respuestas salientes')
      }
    })

    it('idempotencia: reintentos con la misma clave no duplican el envío a OpenBSP', async () => {
      const { sendText } = await import('@/integrations/openbsp/client')
      vi.mocked(sendText).mockClear()

      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584127778899',
          channel: 'whatsapp',
          status: 'open',
          lastInboundAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      const idempotencyKey = 'test-idemp-' + Date.now()

      // Primer envío
      const res1 = await replyConversationAction(conversation.id, 'Mensaje idempotente', idempotencyKey)
      expect(res1.ok).toBe(true)
      expect(sendText).toHaveBeenCalledTimes(1)

      // Segundo intento con la misma clave de idempotencia
      const res2 = await replyConversationAction(conversation.id, 'Mensaje idempotente', idempotencyKey)
      expect(res2.ok).toBe(true)
      // No debe haber invocado sendText nuevamente
      expect(sendText).toHaveBeenCalledTimes(1)
      if (res1.ok && res2.ok) {
        expect(res2.messageId).toBe(res1.messageId)
      }
    })
  })

  describe('updateConversationMetaAction', () => {
    it('actualiza el estado, prioridad y etiquetas de la conversación', async () => {
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584241234567',
          channel: 'whatsapp',
          status: 'open',
          priority: 'baja',
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await updateConversationMetaAction(conversation.id, {
        status: 'resolved',
        priority: 'alta',
        labels: ['urgente', 'facturacion'],
      })

      expect(result.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'conversations',
        id: conversation.id,
        overrideAccess: true,
      })
      expect(updated.status).toBe('resolved')
      expect(updated.priority).toBe('alta')
      expect(updated.labels).toEqual(['urgente', 'facturacion'])
    })

    it('permite asignar un usuario administrador global aunque pertenezca a otro tenant', async () => {
      // user es admin global
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584249998877',
          channel: 'whatsapp',
          status: 'open',
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await updateConversationMetaAction(conversation.id, {
        assignee: user.id,
      })

      expect(result.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'conversations',
        id: conversation.id,
        overrideAccess: true,
      })
      const assigneeId =
        typeof updated.assignee === 'object' && updated.assignee !== null
          ? updated.assignee.id
          : updated.assignee
      expect(assigneeId).toBe(user.id)
    })
  })

  describe('addConversationNoteAction', () => {
    it('agrega una nota privada del equipo vinculada a la conversación', async () => {
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584128889900',
          channel: 'whatsapp',
          status: 'open',
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await addConversationNoteAction(
        conversation.id,
        'Nota interna: El cliente solicitó descuento especial del 15%.',
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const note = await payload.findByID({
        collection: 'conversation-notes',
        id: result.noteId,
        overrideAccess: true,
      })
      expect(note).toBeDefined()
      expect(note.body).toBe('Nota interna: El cliente solicitó descuento especial del 15%.')
      const authorId =
        typeof note.author === 'object' && note.author !== null ? note.author.id : note.author
      expect(authorId).toBe(user.id)
    })

    it('falla si la nota interna está vacía', async () => {
      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584123334455',
          channel: 'whatsapp',
          status: 'open',
          tenant: tenant1.id,
        },
      })) as Conversation

      const result = await addConversationNoteAction(conversation.id, '    ')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('no puede estar vacía')
      }
    })
  })

  describe('summarizeConversationWithAiAction', () => {
    it('retorna éxito incluso si la actualización de notas del lead falla (evitando duplicados en retry)', async () => {
      const lead = await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Lead Prueba IA',
          status: 'nuevo',
          source: 'manual',
          tenant: tenant1.id,
        },
      })

      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584125554433',
          channel: 'whatsapp',
          status: 'open',
          lead: lead.id,
          lastInboundAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      // Crear al menos un mensaje para resumir
      await payload.create({
        collection: 'messages',
        overrideAccess: true,
        data: {
          conversation: conversation.id,
          direction: 'inbound',
          type: 'text',
          text: 'Hola, quiero comprar el servicio',
          sentAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })

      // Espiar payload.update para que falle ÚNICAMENTE cuando actualiza la colección 'leads'
      const originalUpdate = payload.update.bind(payload)
      const updateSpy = vi.spyOn(payload, 'update').mockImplementation(((args: unknown) => {
        const a = args as { collection?: string }
        if (a?.collection === 'leads') {
          throw new Error('Fallo simulado al actualizar notas del lead')
        }
        return (originalUpdate as unknown as (a: unknown) => Promise<unknown>)(args)
      }) as unknown as typeof payload.update)

      try {
        const result = await summarizeConversationWithAiAction(conversation.id)
        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.summaryId).toBeDefined()
          expect(result.summaryText).toContain('Resumen de prueba')

          // Verificar que el resumen canónico existe en la base de datos
          const summaryDoc = await payload.findByID({
            collection: 'conversation-summaries',
            id: result.summaryId,
            overrideAccess: true,
          })
          expect(summaryDoc).toBeDefined()
        }
      } finally {
        updateSpy.mockRestore()
      }
    })
  })

  describe('convertLeadInSituAction en contexto del Inbox', () => {
    it('vincula automáticamente la conversación del lead al nuevo cliente', async () => {
      const { convertLeadInSituAction } = await import('@/lib/crm-pipeline-actions')
      const lead = await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Lead Para Conversion Inbox',
          status: 'nuevo',
          source: 'manual',
          tenant: tenant1.id,
        },
      })

      const conversation = (await payload.create({
        collection: 'conversations',
        overrideAccess: true,
        data: {
          contactAddress: '584126667788',
          channel: 'whatsapp',
          status: 'open',
          lead: lead.id,
          lastInboundAt: new Date().toISOString(),
          tenant: tenant1.id,
        },
      })) as Conversation

      const res = await convertLeadInSituAction(lead.id)
      expect(res.ok).toBe(true)
      if (res.ok) {
        const updatedConv = await payload.findByID({
          collection: 'conversations',
          id: conversation.id,
          overrideAccess: true,
        })
        const clientId =
          typeof updatedConv.client === 'object' && updatedConv.client !== null
            ? updatedConv.client.id
            : updatedConv.client
        expect(clientId).toBe(res.clientId)
      }
    })
  })
})
