import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getPayload, type Payload } from 'payload'
import configPromise from '@/payload.config'
import type { Tenant, User, Conversation } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import {
  replyConversationAction,
  updateConversationMetaAction,
  addConversationNoteAction,
} from '@/lib/inbox-actions'
import { DEFAULT_QUICK_SNIPPETS } from '@/components/workspace/inbox/inbox-snippets'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
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

  beforeEach(async () => {
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
})
