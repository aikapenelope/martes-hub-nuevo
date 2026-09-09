import 'server-only'

import { Composio } from '@composio/core'
import type { Payload } from 'payload'

import { decryptSecret } from '@/lib/crypto'

import {
  composioUserId,
  filterConnectedAccounts,
  type ComposioConnectedAccountRef,
} from './shared'

/**
 * Cliente Composio BYO-key: la API key del proyecto del tenant vive cifrada
 * en `tenant-integrations` (1 fila por tenant) y NUNCA se expone fuera de
 * este módulo.
 *
 * **Modo de operación (decisión de producto):** por defecto el sistema corre
 * en modo CENTRAL — todos los tenants usan el proyecto Composio de la
 * plataforma (`COMPOSIO_API_KEY`) y conectan sus servicios con un solo botón
 * (login hosted); nadie abre Composio ni pega keys. Si un tenant quiere cuota
 * y conexiones propias, el admin pega SU api key en Ajustes y esa fila
 * (cifrada) toma precedencia sobre el default.
 */

export interface TenantComposioContext {
  composio: Composio
  userId: string
  /** De dónde salió la key: 'tenant' (BYO) o 'plataforma' (proyecto central). */
  source: 'tenant' | 'plataforma'
}

export async function getComposioForTenant(
  payload: Payload,
  tenantId: number,
): Promise<TenantComposioContext | null> {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true }).catch(
    () => null,
  )
  if (!tenant) return null

  let apiKey: string | null = null
  let source: TenantComposioContext['source'] = 'plataforma'

  // 1) La fila del tenant gana: BYO-key voluntaria (cuota y conexiones propias).
  const rows = await payload.find({
    collection: 'tenant-integrations',
    where: { tenant: { equals: tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const stored = rows.docs[0]
  if (stored?.apiKeyCifrado) {
    apiKey = decryptSecret(stored.apiKeyCifrado)
    source = 'tenant'
  }

  // 2) Modo central: el proyecto de la plataforma para quien no trajo el suyo
  //    (o para el tenant Martes en deployments con WORKSPACE_DEFAULT_TENANT distinto).
  if (!apiKey && process.env.COMPOSIO_API_KEY) {
    apiKey = process.env.COMPOSIO_API_KEY
  }

  if (!apiKey) return null
  return { composio: new Composio({ apiKey }), userId: composioUserId(tenantId), source }
}

/** Get-or-create del auth config gestionado de un toolkit (Composio pone la app de OAuth). */
export async function getOrCreateManagedAuthConfig(
  composio: Composio,
  toolkit: string,
): Promise<string> {
  const existing = await composio.authConfigs.list({ toolkit, isComposioManaged: true })
  const found = existing.items?.find((config) => config.toolkit?.slug === toolkit)
  if (found?.id) return found.id

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
