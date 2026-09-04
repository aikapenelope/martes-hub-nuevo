import { afterEach, describe, it, expect, vi } from 'vitest'
import { getTenantAiConfig, getTenantAiModel } from '@/lib/ai-provider'
import { summarizeConversationTask } from '@/jobs/summarizeConversation'
import { sweepConversationsTask } from '@/jobs/sweepConversations'
import type { Payload, PayloadRequest } from 'payload'

type SummarizeHandler = (args: { input: Record<string, unknown>; req: PayloadRequest }) => Promise<{ output: { summaryId?: number; skippedReason: string } }>
type SweepHandler = (args: { input: Record<string, unknown>; req: PayloadRequest }) => Promise<{ output: { queued: number; skipped: number } }>

const runSummarize = summarizeConversationTask.handler as unknown as SummarizeHandler
const runSweep = sweepConversationsTask.handler as unknown as SweepHandler

function mockPayload(findImpl?: (args: Record<string, unknown>) => Promise<{ docs: unknown[]; totalDocs: number }>): Payload {
  return {
    find: vi.fn().mockImplementation(findImpl || (() => Promise.resolve({ docs: [], totalDocs: 0 }))),
    findByID: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    jobs: {
      queue: vi.fn().mockResolvedValue({ id: 1 }),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as Payload
}

describe('AI Worker Ligero (Groq / OpenRouter)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('getTenantAiConfig', () => {
    it('devuelve valores por defecto seguros si el tenant no tiene ajustes guardados', async () => {
      const payload = mockPayload()
      const config = await getTenantAiConfig(payload, 1)

      expect(config.provider).toBe('groq')
      expect(config.apiKey).toBeNull()
      expect(config.model).toBe('llama-3.3-70b-versatile')
      expect(config.autoSummarize).toBe(true)
    })

    it('lee la configuración específica del tenant desde company-settings', async () => {
      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'company-settings') {
          return {
            docs: [
              {
                id: 10,
                aiProvider: 'openrouter',
                aiApiKey: 'sk-or-v1-testkey123',
                aiModel: 'meta-llama/llama-3.3-70b-instruct',
                aiAutoSummarize: false,
              },
            ],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })

      const config = await getTenantAiConfig(payload, 2)
      expect(config.provider).toBe('openrouter')
      expect(config.apiKey).toBe('sk-or-v1-testkey123')
      expect(config.model).toBe('meta-llama/llama-3.3-70b-instruct')
      expect(config.autoSummarize).toBe(false)
    })
  })

  describe('getTenantAiModel', () => {
    it('retorna null si no hay API key en el tenant ni en variables de entorno', async () => {
      vi.stubEnv('GROQ_API_KEY', '')
      vi.stubEnv('OPENROUTER_API_KEY', '')
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('ANTHROPIC_API_KEY', '')

      const payload = mockPayload()
      const resolved = await getTenantAiModel(payload, 1)
      expect(resolved).toBeNull()
    })

    it('resuelve Groq cuando GROQ_API_KEY está configurada en entorno', async () => {
      vi.stubEnv('GROQ_API_KEY', 'gsk_env_test_key')

      const payload = mockPayload()
      const resolved = await getTenantAiModel(payload, 1)

      expect(resolved).not.toBeNull()
      expect(resolved?.provider).toBe('groq')
      expect(resolved?.modelName).toBe('llama-3.3-70b-versatile')
    })

    it('prioriza la API key explícita del tenant sobre la variable de entorno', async () => {
      vi.stubEnv('GROQ_API_KEY', 'gsk_env_key')

      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'company-settings') {
          return {
            docs: [
              {
                id: 10,
                aiProvider: 'openrouter',
                aiApiKey: 'sk-or-tenant-key',
                aiModel: 'meta-llama/llama-3.3-70b-instruct',
                aiAutoSummarize: true,
              },
            ],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })

      const resolved = await getTenantAiModel(payload, 1)
      expect(resolved).not.toBeNull()
      expect(resolved?.provider).toBe('openrouter')
      expect(resolved?.modelName).toBe('meta-llama/llama-3.3-70b-instruct')
    })
  })

  describe('summarizeConversationTask', () => {
    it('declara los metadatos y schemas requeridos', () => {
      expect(summarizeConversationTask.slug).toBe('summarize-conversation')
      expect(summarizeConversationTask.label).toBe('Resumen y perfilado IA de conversación')
      expect(summarizeConversationTask.inputSchema).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'conversationId', type: 'number' }),
          expect.objectContaining({ name: 'tenantId', type: 'number' }),
          expect.objectContaining({ name: 'trigger', type: 'text' }),
        ]),
      )
    })

    it('lanza error si faltan conversationId o tenantId numéricos', async () => {
      const req = { payload: mockPayload() } as unknown as PayloadRequest

      await expect(
        runSummarize({
          input: { conversationId: 'invalido' as unknown as number, tenantId: 1 },
          req,
        }),
      ).rejects.toThrow('Parámetros inválidos')
    })

    it('omite la ejecución si autoSummarize está desactivado y el trigger es inbound_message', async () => {
      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'company-settings') {
          return {
            docs: [{ id: 1, aiAutoSummarize: false }],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })
      const req = { payload } as unknown as PayloadRequest

      const result = await runSummarize({
        input: { conversationId: 5, tenantId: 1, trigger: 'inbound_message' },
        req,
      })

      expect(result.output.skippedReason).toContain('Auto-resumen deshabilitado')
    })

    it('omite idénticamente si ya existe un resumen posterior al último mensaje', async () => {
      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'conversation-summaries') {
          return {
            docs: [
              {
                id: 99,
                createdAt: '2026-09-04T12:00:00Z',
              },
            ],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })
      vi.mocked(payload.findByID).mockResolvedValue({
        id: 5,
        lastMessageAt: '2026-09-04T11:00:00Z',
      } as never)

      const req = { payload } as unknown as PayloadRequest

      const result = await runSummarize({
        input: { conversationId: 5, tenantId: 1, trigger: 'manual' },
        req,
      })

      expect(result.output.skippedReason).toContain('ya tiene un resumen actualizado')
    })

    it('omite si la conversación tiene menos de 2 mensajes', async () => {
      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'messages') {
          return {
            docs: [{ id: 1, text: 'Hola', direction: 'inbound', sentAt: '2026-09-04T12:00:00Z' }],
            totalDocs: 1,
          }
        }
        return { docs: [], totalDocs: 0 }
      })
      vi.mocked(payload.findByID).mockResolvedValue({
        id: 5,
        lastMessageAt: '2026-09-04T12:00:00Z',
      } as never)

      const req = { payload } as unknown as PayloadRequest

      const result = await runSummarize({
        input: { conversationId: 5, tenantId: 1, trigger: 'manual' },
        req,
      })

      expect(result.output.skippedReason).toContain('Menos de 2 mensajes')
    })
  })

  describe('sweepConversationsTask', () => {
    it('declara slug y schedule cron en cola ai', () => {
      expect(sweepConversationsTask.slug).toBe('sweep-unsummarized-conversations')
      expect(sweepConversationsTask.schedule).toEqual([
        expect.objectContaining({ cron: '15 * * * *', queue: 'ai' }),
      ])
    })

    it('encola resumen para conversaciones activas sin resumen reciente', async () => {
      const payload = mockPayload(async ({ collection }) => {
        if (collection === 'tenants') {
          return { docs: [{ id: 1, name: 'Tenant 1' }], totalDocs: 1 }
        }
        if (collection === 'conversations') {
          return {
            docs: [
              {
                id: 101,
                lastMessageAt: new Date().toISOString(),
              },
            ],
            totalDocs: 1,
          }
        }
        if (collection === 'conversation-summaries') {
          return { docs: [], totalDocs: 0 } // Sin resúmenes previos
        }
        return { docs: [], totalDocs: 0 }
      })

      const req = { payload } as unknown as PayloadRequest

      const result = await runSweep({
        input: {},
        req,
      })

      expect(result.output.queued).toBe(1)
      expect(payload.jobs.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'summarize-conversation',
          input: expect.objectContaining({
            conversationId: 101,
            tenantId: 1,
            trigger: 'scheduled_sweep',
          }),
        }),
      )
    })
  })
})
