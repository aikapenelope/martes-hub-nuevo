import { afterEach, describe, it, expect, vi } from 'vitest'
import { getIntegrationsHealth } from '@/lib/integrations-health'
import type { Payload } from 'payload'
import type { Tenant } from '@/payload-types'

function mockPayload(
  impl: (args: { collection: string }) => { docs: unknown[]; totalDocs: number } = () => ({
    docs: [],
    totalDocs: 0,
  }),
): Payload {
  return {
    find: vi.fn().mockImplementation((args: { collection: string }) =>
      Promise.resolve(impl(args)),
    ),
  } as unknown as Payload
}

const bareTenant = { id: 10 } as Tenant

describe('getIntegrationsHealth — salud de integraciones', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('overallStatus con canales deshabilitados', () => {
    it('no reporta "healthy" cuando un canal está disabled y el resto sano', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')
      vi.stubEnv('RESEND_API_KEY', '') // email deshabilitado
      vi.stubEnv('GOOGLE_CLIENT_ID', '')
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', '')

      const health = await getIntegrationsHealth(mockPayload(), bareTenant, 10)

      expect(health.items.find((i) => i.id === 'email')?.status).toBe('disabled')
      expect(health.overallStatus).toBe('disabled')
    })

    it('reporta healthy solo cuando todos los canales están operativos', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')
      vi.stubEnv('RESEND_API_KEY', 'reSEND')
      vi.stubEnv('GOOGLE_CLIENT_ID', 'gid')
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsec')
      vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'gtok')

      const health = await getIntegrationsHealth(mockPayload(), bareTenant, 10)

      expect(health.overallStatus).toBe('healthy')
    })
  })

  describe('check de WhatsApp alineado con sendText()', () => {
    it('acepta organización y teléfono del tenant aunque no existan en el entorno', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', '')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', '')

      const tenant = {
        id: 10,
        openbspOrganizationId: 'org-tenant',
        openbspPhoneNumberId: 'phone-tenant',
      } as unknown as Tenant

      const health = await getIntegrationsHealth(mockPayload(), tenant, 10)
      const whatsapp = health.items.find((i) => i.id === 'whatsapp')

      expect(whatsapp?.status).toBe('healthy')
      expect(whatsapp?.detail).toContain('phone-tenant')
    })

    it('marca warning cuando falta el teléfono efectivo (ni tenant ni entorno)', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', '')

      const health = await getIntegrationsHealth(mockPayload(), bareTenant, 10)
      const whatsapp = health.items.find((i) => i.id === 'whatsapp')

      expect(whatsapp?.status).toBe('warning')
      expect(whatsapp?.badge).toBe('FALTA TELÉFONO')
    })

    it('marca disabled cuando faltan las claves de API del entorno', async () => {
      vi.stubEnv('OPENBSP_API_KEY', '')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')

      const health = await getIntegrationsHealth(mockPayload(), bareTenant, 10)
      const whatsapp = health.items.find((i) => i.id === 'whatsapp')

      expect(whatsapp?.status).toBe('disabled')
    })
  })

  describe('fuente real de fallos de webhooks/workers', () => {
    it('cuenta errores desde notifications (severity=error) y email-log (failed/bounced), no desde activities', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')

      const payload = mockPayload(({ collection }) => {
        if (collection === 'notifications') return { docs: [{ id: 1 }, { id: 2 }], totalDocs: 2 }
        if (collection === 'email-log') return { docs: [{ id: 3 }], totalDocs: 1 }
        return { docs: [], totalDocs: 0 }
      })

      const health = await getIntegrationsHealth(payload, bareTenant, 10)
      const webhooks = health.items.find((i) => i.id === 'webhooks')

      expect(health.recentErrorCount).toBe(3)
      expect(webhooks?.status).toBe('warning')
      expect(webhooks?.badge).toBe('3 ERRORES')
      expect(webhooks?.actionHref).toBe('/workspace/notifications')

      const find = payload.find as ReturnType<typeof vi.fn>
      const queriedCollections = find.mock.calls.map((c: unknown[]) => (c[0] as { collection: string }).collection)
      expect(queriedCollections).toContain('notifications')
      expect(queriedCollections).toContain('email-log')
      expect(queriedCollections).not.toContain('activities')
    })

    it('clasifica el canal de webhooks como error con más de 5 fallos en 24h', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')

      const payload = mockPayload(({ collection }) =>
        collection === 'notifications' ? { docs: [], totalDocs: 7 } : { docs: [], totalDocs: 0 },
      )

      const health = await getIntegrationsHealth(payload, bareTenant, 10)
      const webhooks = health.items.find((i) => i.id === 'webhooks')

      expect(webhooks?.status).toBe('error')
      expect(health.overallStatus).toBe('error')
    })

    it('marca telemetría caída en vez de reportar estabilidad falsa si falla una consulta', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')

      const payload = {
        find: vi.fn().mockImplementation(({ collection }: { collection: string }) =>
          collection === 'notifications'
            ? Promise.reject(new Error('db down'))
            : Promise.resolve({ docs: [], totalDocs: 0 }),
        ),
      } as unknown as Payload

      const health = await getIntegrationsHealth(payload, bareTenant, 10)
      const webhooks = health.items.find((i) => i.id === 'webhooks')

      // No debe ser 'healthy': no consultar no equivale a "0 fallos"
      expect(webhooks?.status).toBe('warning')
      expect(webhooks?.badge).toBe('TELEMETRÍA CAÍDA')
      expect(health.overallStatus).toBe('warning')
    })

    it('usa updatedAt (no createdAt) para contar rebotes tardíos del email-log', async () => {
      vi.stubEnv('OPENBSP_API_KEY', 'key')
      vi.stubEnv('OPENBSP_PUBLISHABLE_KEY', 'pub')
      vi.stubEnv('OPENBSP_ORG_ID', 'org')
      vi.stubEnv('OPENBSP_PHONE_NUMBER_ID', 'phone')

      const payload = {
        find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      } as unknown as Payload

      await getIntegrationsHealth(payload, bareTenant, 10)

      const find = payload.find as ReturnType<typeof vi.fn>
      const emailLogCall = find.mock.calls
        .map((c: unknown[]) => c[0] as { collection: string; where: { and: Record<string, unknown>[] } })
        .find((a) => a.collection === 'email-log')

      expect(emailLogCall).toBeDefined()
      const filters = emailLogCall!.where.and.map((f) => Object.keys(f)[0])
      expect(filters).toContain('updatedAt')
      expect(filters).not.toContain('createdAt')
    })
  })
})
