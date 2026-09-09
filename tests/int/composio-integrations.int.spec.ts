import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { decryptSecret, encryptSecret } from '@/lib/crypto'
import {
  extractCreationId,
  extractIgUserId,
  isPurgeDue,
  parseToolData,
} from '@/lib/social-publish'
import {
  composioTenantUserId,
  composioUserUserId,
  filterConnectedAccounts,
  type ComposioConnectedAccountRef,
} from '@/integrations/composio/shared'
import { getComposioForTenant } from '@/integrations/composio/client'


beforeEach(() => {
  vi.resetModules()
  process.env.INTEGRATIONS_ENC_KEY = 'test-passphrase-spike'
})

describe('crypto — AES-256-GCM', () => {
  it('cifra y descifra redondeando el valor original', () => {
    const secret = 'key_composio_super_secreta_123'
    const stored = encryptSecret(secret)
    expect(stored).not.toContain(secret)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(decryptSecret(stored)).toBe(secret)
  })

  it('produce iv distintos para el mismo texto (no determinista en reposo)', () => {
    expect(encryptSecret('mismo')).not.toBe(encryptSecret('mismo'))
  })

  it('detecta el formato cifrado', () => {
    expect(isEncryptedFormat(encryptSecret('x'))).toBe(true)
    expect(isEncryptedFormat('texto-plano')).toBe(false)
  })
})

function isEncryptedFormat(value: string): boolean {
  // Reexportado vía helper del módulo para no exponer más superficie.
  return /^[a-z0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value)
}

describe('composio/shared — userId y filtro de conexiones', () => {
  it('userId aislado por tenant', () => {
    expect(composioTenantUserId(7)).toBe('martes-hub:7')
  })

  it('userId personal aislado por usuario dentro del tenant', () => {
    expect(composioUserUserId(7, 42)).toBe('martes-hub:7:u:42')
  })

  const ig = (overrides: Partial<ComposioConnectedAccountRef>): ComposioConnectedAccountRef => ({
    id: 'conn_1',
    authConfigId: 'ac_ig',
    toolkit: 'instagram',
    status: 'ACTIVE',
    ...overrides,
  })

  it('selecciona solo la cuenta que coincide con authConfigId + toolkit', () => {
    const accounts = [
      ig({ id: 'conn_gmail', authConfigId: 'ac_gmail', toolkit: 'gmail' }),
      ig({ id: 'conn_ig_vieja', status: 'INACTIVE' }),
      ig({ id: 'conn_ig_ok' }),
    ]
    const chosen = filterConnectedAccounts(accounts, { authConfigId: 'ac_ig', toolkit: 'instagram' })
    expect(chosen?.id).toBe('conn_ig_ok')
  })

  it('devuelve null si ninguna coincide (login aún no completado)', () => {
    const accounts = [ig({ id: 'conn_x', authConfigId: 'ac_otro' })]
    expect(filterConnectedAccounts(accounts, { authConfigId: 'ac_ig', toolkit: 'instagram' })).toBeNull()
  })

  it('acepta toolkit como objeto anidado del SDK', () => {
    const accounts = [ig({ toolkit: { slug: 'instagram' } })]
    expect(filterConnectedAccounts(accounts, { authConfigId: 'ac_ig', toolkit: 'instagram' })?.id).toBe('conn_1')
  })
})

describe('getComposioForTenant — central por defecto, BYO opcional', () => {
  function mockPayload(docs: Record<string, unknown>[]): Payload {
    return {
      find: vi.fn().mockResolvedValue({ docs }),
      findByID: vi.fn().mockResolvedValue({ id: 1, slug: 'martes' }),
    } as unknown as Payload
  }

  it('BYO: la key cifrada del tenant tiene precedencia y reporta source tenant', async () => {
    const stored = encryptSecret('key_del_tenant')
    const session = await getComposioForTenant(mockPayload([{ apiKeyCifrado: stored }]), 1)
    expect(session).not.toBeNull()
    expect(session!.userId).toBe('martes-hub:1')
    expect(session!.source).toBe('tenant')
  })

  it('modo central: sin fila propia, usa la key del operador (cualquier tenant)', async () => {
    process.env.COMPOSIO_API_KEY = 'key_de_la_plataforma'
    const session = await getComposioForTenant(mockPayload([]), 1)
    expect(session).not.toBeNull()
    expect(session!.source).toBe('plataforma')
  })

  it('devuelve null sin fila del tenant y sin key del operador (sin fallback a Meta)', async () => {
    delete process.env.COMPOSIO_API_KEY
    const session = await getComposioForTenant(mockPayload([]), 1)
    expect(session).toBeNull()
  })
})

describe('social-publish — helpers del pipeline de publicación', () => {
  it('parseToolData extrae el JSON string de la respuesta de Composio', () => {
    expect(parseToolData({ data: '{"id":"1789"}' })).toEqual({ id: '1789' })
    expect(parseToolData({ data: 'no-json' })).toEqual({})
    expect(parseToolData(null)).toEqual({})
  })

  it('extrae ig_user_id y creation_id de las respuestas del flujo publish', () => {
    expect(extractIgUserId({ data: '{"id":"17841400000000"}' })).toBe('17841400000000')
    expect(extractCreationId({ data: '{"id":"179000000000"}' })).toBe('179000000000')
    expect(extractIgUserId({ data: '{}' })).toBeNull()
    expect(extractCreationId({ data: '{"error":"boom"}' })).toBeNull()
  })

  it('isPurgeDue: solo posts publicados con más de 48h sin purgar', () => {
    const now = Date.parse('2026-09-10T12:00:00Z')
    const setup = {
      postStatus: 'publicado',
      publishedAt: '2026-09-08T09:00:00Z', // 51h antes
      purgedAt: null,
      now,
    }
    expect(isPurgeDue(setup)).toBe(true)
    // Dentro del TTL
    expect(isPurgeDue({ ...setup, publishedAt: '2026-09-09T00:00:00Z' })).toBe(false)
    // Ya purgada
    expect(isPurgeDue({ ...setup, purgedAt: '2026-09-09T00:00:00Z' })).toBe(false)
    // No publicado
    expect(isPurgeDue({ ...setup, postStatus: 'borrador' })).toBe(false)
    // Sin publishedAt
    expect(isPurgeDue({ ...setup, publishedAt: null })).toBe(false)
  })
})
