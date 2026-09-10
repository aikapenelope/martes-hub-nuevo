import { Composio } from '@composio/core'
import type { Payload } from 'payload'

import { decryptSecret } from '@/lib/crypto'

import {
  composioTenantUserId,
  filterConnectedAccounts,
  type ComposioConnectedAccountRef,
} from './shared'

/**
 * Cliente Composio por tenant.
 *
 * NOTA: este archivo NO debe importar 'server-only': forma parte del grafo de
 * imports de payload.config.ts (vía jobs/…), y ese módulo lanza fuera de Next
 * (generate:types / migrate) — misma convención que `lead-scoring.ts`. Solo se
 * usa desde servidor por diseño (server actions + jobs): la key nunca llega al
 * cliente porque solo este módulo la descifra.
 *
 * **Modelo de keys (docs oficiales + decisión de producto):**
 * - **Project key del tenant** (BYO): el operador crea la cuenta Composio del
 *   cliente y pega SU key en /admin → tenant-integrations (cifrada). Todo el
 *   consumo de ese tenant factura a SU cuenta — nadie toca cuota ajena.
 * - **Key del operador** (`COMPOSIO_API_KEY`): SOLO aplica al tenant default
 *   (Martes). No es fallback universal: si un tenant no tiene key asignada,
 *   no puede conectar (la UI lo indica) — así nadie consume cuota ajena.
 * - No confundir con la **Org Key** de Composio (administración: crea
 *   proyectos y puede leer las API keys de la org — la "llave base" que lee
 *   otras keys): sirve para aprovisionar/rotar desde código, pero el billing
 *   sigue siendo de la organización — no es un fallback de ejecución.
 */

export interface TenantComposioContext {
  composio: Composio
  userId: string
  /** De dónde salió la key: 'tenant' (BYO) o 'operador' (solo tenant Martes). */
  source: 'tenant' | 'operador'
}

export async function getComposioForTenant(
  payload: Payload,
  tenantId: number,
): Promise<TenantComposioContext | null> {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true }).catch(
    () => null,
  )
  if (!tenant) return null

  // Consistente con workspace-context (que nunca hardcodea slugs): la key del
  // operador SOLO aplica si WORKSPACE_DEFAULT_TENANT está explícito y coincide.
  const defaultTenantSlug = process.env.WORKSPACE_DEFAULT_TENANT
  const isDefaultTenant = Boolean(defaultTenantSlug) && tenant.slug === defaultTenantSlug

  // 1) La fila del tenant gana: key asignada por el operador (cuota propia).
  const rows = await payload.find({
    collection: 'tenant-integrations',
    where: { tenant: { equals: tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const stored = rows.docs[0]
  if (stored?.apiKeyCifrado) {
    return { composio: new Composio({ apiKey: decryptSecret(stored.apiKeyCifrado) }), userId: composioTenantUserId(tenantId), source: 'tenant' }
  }

  // 2) Sin key propia: SOLO el tenant default usa la key del operador.
  //    Los demás tenants no conectan hasta que el operador les asigne la suya.
  if (isDefaultTenant && process.env.COMPOSIO_API_KEY) {
    return {
      composio: new Composio({ apiKey: process.env.COMPOSIO_API_KEY }),
      userId: composioTenantUserId(tenantId),
      source: 'operador',
    }
  }

  return null
}

/**
 * Get-or-create del auth config de un toolkit:
 * - Managed (Instagram, Gmail, GCal…): Composio pone la app de OAuth.
 * - Custom (TikTok — sin managed auth): usa NUESTRA app registrada en
 *   developers.tiktok.com vía TIKTOK_CLIENT_ID/TIKTOK_CLIENT_SECRET (env del
 *   operador; la misma app sirve para todos los tenants — el redirect es el
 *   callback de Composio, docs: backend.composio.dev/api/v3/toolkits/auth/callback).
 */
export async function getOrCreateManagedAuthConfig(
  composio: Composio,
  toolkit: string,
): Promise<string> {
  const existing = await composio.authConfigs.list({ toolkit })
  const found = existing.items?.find((config) => config.toolkit?.slug === toolkit)
  if (found?.id) return found.id

  if (toolkit === 'tiktok') {
    const clientId = process.env.TIKTOK_CLIENT_ID
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error(
        'TikTok requiere la app propia registrada: configura TIKTOK_CLIENT_ID y TIKTOK_CLIENT_SECRET (fase 4, doc ideas-futuras/06)',
      )
    }
    const created = await composio.authConfigs.create(toolkit, {
      type: 'use_custom_auth',
      authScheme: 'OAUTH2',
      name: 'Martes Hub TikTok',
      credentials: {
        client_id: clientId,
        client_secret: clientSecret,
        oauth_redirect_uri: 'https://backend.composio.dev/api/v3/toolkits/auth/callback',
      },
    })
    const customId = created?.id
    if (!customId) throw new Error('Composio no devolvió id de auth config para tiktok')
    return customId
  }

  const managedExisting = await composio.authConfigs.list({ toolkit, isComposioManaged: true })
  const managed = managedExisting.items?.find((config) => config.toolkit?.slug === toolkit)
  if (managed?.id) return managed.id

  const created = await composio.authConfigs.create(toolkit, {
    type: 'use_composio_managed_auth',
    name: `Martes Hub ${toolkit}`,
  })
  const createdId = created?.id
  if (!createdId) throw new Error(`Composio no devolvió id de auth config para "${toolkit}"`)
  return createdId
}

/** Crea el link de autenticación hosted para que el tenant loguee en el servicio real. */
export async function createConnectionLink(
  composio: Composio,
  options: { userId: string; authConfigId: string; toolkit: string; callbackUrl: string },
): Promise<{ redirectUrl: string; connectionRequestId: string }> {
  const request = await composio.connectedAccounts.link(options.userId, options.authConfigId, {
    callbackUrl: options.callbackUrl,
  })
  if (!request?.redirectUrl || !request?.id) {
    throw new Error('Composio no devolvió un link de conexión válido')
  }
  return { redirectUrl: request.redirectUrl, connectionRequestId: request.id }
}

/**
 * Verificación determinista de una conexión: lista los connected accounts del
 * userId y selecciona SOLO el que coincide con el authConfigId + toolkit
 * esperados (varios toolkits comparten el mismo userId).
 */
export async function verifyConnection(
  composio: Composio,
  options: { userId: string; toolkit: string; authConfigId: string },
): Promise<ComposioConnectedAccountRef | null> {
  const listed = await composio.connectedAccounts.list({
    userIds: [options.userId],
    toolkitSlugs: [options.toolkit],
    authConfigIds: [options.authConfigId],
  })
  const accounts: ComposioConnectedAccountRef[] = (listed.items ?? []).map((account) => ({
    id: account.id,
    authConfigId: account.authConfig?.id ?? null,
    toolkit: account.toolkit ?? null,
    status: account.status ?? null,
  }))
  return filterConnectedAccounts(accounts, { authConfigId: options.authConfigId, toolkit: options.toolkit })
}

/** Revoca y elimina el connected account en Composio (desconexión del tenant). */
export async function deleteConnectedAccount(composio: Composio, connectedAccountId: string): Promise<void> {
  await composio.connectedAccounts.delete(connectedAccountId)
}

/** Versiones de toolkit cacheadas 1h — execute exige versión fijada, nunca 'latest'. */
const versionCache = new Map<string, { version: string; expiresAt: number }>()
const VERSION_TTL_MS = 60 * 60 * 1000

export async function getToolkitVersion(composio: Composio, toolkit: string): Promise<string> {
  const cached = versionCache.get(toolkit)
  if (cached && cached.expiresAt > Date.now()) return cached.version
  // El SDK expone las versiones en `meta.availableVersions` (la vigente, primera);
  // execute exige versión fijada — nunca 'latest'.
  const info = await composio.toolkits.get(toolkit)
  const version = info.meta?.availableVersions?.[0]
  if (!version) throw new Error(`Composio no devolvió versiones para el toolkit "${toolkit}"`)
  versionCache.set(toolkit, { version, expiresAt: Date.now() + VERSION_TTL_MS })
  return version
}

/**
 * Ejecución determinista de una acción de Composio (sin LLM): inyecta userId
 * y la versión fijada del toolkit. Los errores suben crudos — la UI los
 * muestra sin fallback (decisión de producto).
 */
export async function executeTool<T = unknown>(
  composio: Composio,
  options: { toolkit: string; slug: string; userId: string; args: Record<string, unknown> },
): Promise<T> {
  const version = await getToolkitVersion(composio, options.toolkit)
  const result = await composio.tools.execute(options.slug, {
    userId: options.userId,
    arguments: options.args,
    version,
  })
  return result as T
}
