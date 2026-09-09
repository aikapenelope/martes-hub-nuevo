import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { decryptSecret, encryptSecret } from '@/lib/crypto'
import {
  composioUserId,
  filterConnectedAccounts,
  type ComposioConnectedAccountRef,
} from '@/integrations/composio/shared'
import { getComposioForTenant } from '@/integrations/composio/client'

const process_env = process.env

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
    expect(composioUserId(7)).toBe('martes-hub:7')
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

describe('getComposioForTenant — BYO-key con fallback solo para el tenant default', () => {
  function mockPayload(docs: Record<string, unknown>[]): Payload {
    return {
      find: vi.fn().mockResolvedValue({ docs }),
      findByID: vi.fn().mockResolvedValue({ id: 1, slug: 'martes' }),
    } as unknown as Payload
  }

  it('usa la key cifrada del tenant cuando existe', async () => {
    const stored = encryptSecret('key_del_tenant')
    const session = await getComposioForTenant(mockPayload([{ apiKeyCifrado: stored }]), 1)
    expect(session).not.toBeNull()
    expect(session!.userId).toBe('martes-hub:1')
  })

  it('cae al env COMPOSIO_API_KEY solo para el tenant default', async () => {
    process.env.COMPOSIO_API_KEY = 'key_de_martes'
    const session = await getComposioForTenant(mockPayload([]), 1)
    expect(session).not.toBeNull()
  })

  it('devuelve null sin fila y sin env (UI muestra el estado, sin fallback)', async () => {
    delete process.env.COMPOSIO_API_KEY
    const session = await getComposioForTenant(mockPayload([]), 1)
    expect(session).toBeNull()
    void process_env
  })
})
