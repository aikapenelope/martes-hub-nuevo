import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

/**
 * Cifrador AES-256-GCM para secretos de integraciones por tenant (API keys
 * de Composio). Sin `import 'server-only'` a propósito: los tests lo importan
 * directo; solo corre en servidor por diseño (lo llaman server actions y jobs).
 *
 * Formato: `v1:<iv_b64>:<tag_b64>:<cifrado_b64>`. La key de cifrado viene de
 * `INTEGRATIONS_ENC_KEY` (passphrase → scrypt a 32 bytes).
 */

const FORMAT_VERSION = 'v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.INTEGRATIONS_ENC_KEY
  if (!secret) {
    throw new Error(
      'INTEGRATIONS_ENC_KEY no configurada — requiere una passphrase para cifrar secrets de integraciones',
    )
  }
  cachedKey = scryptSync(secret, 'martes-hub:integraciones:v1', 32)
  return cachedKey
}

/** Cifra texto plano con AES-256-GCM. Nunca devuelve el original en logs. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/** Descifra un valor producido por `encryptSecret`. Lanza si el tag no coincide. */
export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(':')
  if (version !== FORMAT_VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de secreto cifrado desconocido')
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString(
    'utf8',
  )
}

/** ¿El valor tiene la forma de un secreto cifrado por este módulo? */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${FORMAT_VERSION}:`)
}
