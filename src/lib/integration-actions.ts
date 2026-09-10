'use server'

import { revalidatePath } from 'next/cache'

import { encryptSecret } from '@/lib/crypto'
import {
  createConnectionLink,
  deleteConnectedAccount,
  getComposioForTenant,
  getOrCreateManagedAuthConfig,
  verifyConnection,
} from '@/integrations/composio/client'
import { isSupportedToolkit } from '@/integrations/composio/shared'
import { getWorkspaceContext } from '@/lib/workspace-context'

type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

const SETTINGS_PATH = '/workspace/settings'
const CALLBACK_PATH = '/auth/composio/callback'

/** Toolkits que admiten conexión personal (por usuario) además de la de la empresa. */
const PERSONAL_TOOLKITS = new Set(['gmail', 'googlecalendar', 'googlesheets', 'googledocs'])

export type ConnectionScope = 'empresa' | 'personal'

function resolveScope(toolkit: string, scope: ConnectionScope): ConnectionScope | 'invalida' {
  if (!isSupportedToolkit(toolkit)) return 'invalida'
  if (scope === 'personal' && !PERSONAL_TOOLKITS.has(toolkit)) return 'invalida'
  // Instagram (y TikTok) son siempre de la empresa: solo existe una cuenta del negocio.
  if (scope === 'personal' && (toolkit === 'instagram' || toolkit === 'tiktok')) return 'invalida'
  return scope
}

/**
 * Origen allowlist para el callback de OAuth — NUNCA el header `Host` (un
 * host forjado redirigiría el resultado del OAuth a un dominio ajeno).
 * Producción: NEXT_PUBLIC_APP_URL o VERCEL_*; desarrollo: localhost.
 */
function allowedOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  return 'http://localhost:3000'
}

/** Error seguro para UI: quita saltos y acota — el crudo queda en BD/logs. */
function safeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  return message.replace(/\s+/g, ' ').trim().slice(0, 200)
}

interface ConnectionRow {
  id: number
  scope: ConnectionScope
  userId: number | null
  authConfigId: string | null
  connectedAccountId: string | null
  estado: string
}

async function findTenantConnection(
  tenantId: number,
  toolkit: string,
  scope: ConnectionScope,
  ownerId: number | null,
): Promise<ConnectionRow | null> {
  const context = await getWorkspaceContext()
  const userCondition =
    scope === 'personal' ? { user: { equals: ownerId ?? -1 } } : { user: { exists: false } }
  const res = await context.payload.find({
    collection: 'tenant-connections',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { toolkit: { equals: toolkit as 'instagram' } },
        { scope: { equals: scope } },
        userCondition,
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = res.docs[0]
  if (!doc) return null
  return {
    id: doc.id,
    scope,
    userId: typeof doc.user === 'object' ? (doc.user?.id ?? null) : (doc.user ?? null),
    authConfigId: doc.authConfigId ?? null,
    connectedAccountId: doc.connectedAccountId ?? null,
    estado: doc.estado,
  }
}

/**
 * Guarda (o reemplaza) la API key del proyecto Composio del tenant, cifrada.
 * Valida la key contra la API de Composio antes de persistir. Admin-only.
 * El superadmin también puede asignarla por tenant desde `/admin`
 * (campo write-only `apiKey`, cifrado en beforeValidate).
 */
export async function saveComposioKeyAction(apiKey: string): Promise<ActionResult> {
  try {
    const trimmed = apiKey.trim()
    if (!trimmed) return { ok: false, error: 'Pega la API key de tu proyecto Composio' }

    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede cambiar la conexión Composio' }

    const { Composio } = await import('@composio/core')
    try {
      const probe = new Composio({ apiKey: trimmed })
      await probe.authConfigs.list({})
    } catch {
      return { ok: false, error: 'Composio rechazó la API key — revísala en platform.composio.dev' }
    }

    const existing = await context.payload.find({
      collection: 'tenant-integrations',
      where: { tenant: { equals: context.tenantId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const data = { provider: 'composio' as const, apiKeyCifrado: encryptSecret(trimmed), estado: 'ok' as const }

    if (existing.docs[0]) {
      await context.payload.update({
        collection: 'tenant-integrations',
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      })
    } else {
      await context.payload.create({
        collection: 'tenant-integrations',
        data: { ...data, tenant: context.tenantId },
        overrideAccess: true,
      })
    }

    // Rotación de key = proyecto distinto: los connected accounts viejos viven
    // en el proyecto anterior y quedan inválidos. Reset de TODAS las conexiones
    // del tenant para que se reconecten contra el nuevo proyecto.
    const staleConnections = await context.payload.find({
      collection: 'tenant-connections',
      where: { tenant: { equals: context.tenantId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const connection of staleConnections.docs) {
      await context.payload.update({
        collection: 'tenant-connections',
        id: connection.id,
        data: {
          estado: 'desconectado',
          connectedAccountId: null,
          authConfigId: null,
          ultimoError: 'La API key cambió — reconecta los servicios contra el nuevo proyecto',
        },
        overrideAccess: true,
      })
    }

    revalidatePath(SETTINGS_PATH)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeError(error, 'Error al guardar la API key') }
  }
}

/**
 * Inicia la conexión de un toolkit en un alcance: link hosted para que el
 * usuario loguee en el servicio real.
 * - `empresa`: solo admins (Instagram corporativo, correo/calendario del negocio).
 * - `personal`: cada usuario conecta SU cuenta (su Gmail, su calendario).
 * En ambos casos la key es la del proyecto Composio del tenant — el consumo
 * factura al tenant.
 */
export async function startConnectionAction(
  toolkit: string,
  scope: ConnectionScope = 'empresa',
): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const resolved = resolveScope(toolkit, scope)
    if (resolved === 'invalida') return { ok: false, error: `Alcance no válido para ${toolkit}` }

    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para conectar servicios' }
    if (scope === 'empresa' && !context.isAdmin) {
      return { ok: false, error: 'Las conexiones de la empresa requieren rol admin' }
    }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) {
      return {
        ok: false,
        error:
          'Composio no está configurado para este tenant (el operador debe asignar la API key) y no hay key del operador',
      }
    }

    const authConfigId = await getOrCreateManagedAuthConfig(session.composio, toolkit)
    const origin = allowedOrigin()
    const userId =
      scope === 'personal'
        ? `${session.userId}:u:${context.user.id}`
        : session.userId
    const { redirectUrl } = await createConnectionLink(session.composio, {
      userId,
      authConfigId,
      toolkit,
      callbackUrl: `${origin}${CALLBACK_PATH}`,
    })

    const existing = await findTenantConnection(context.tenantId, toolkit, scope, context.user.id)
    if (existing) {
      await context.payload.update({
        collection: 'tenant-connections',
        id: existing.id,
        data: { authConfigId, estado: 'conectando', ultimoError: null, connectedBy: context.user.id },
        overrideAccess: true,
      })
    } else {
      await context.payload.create({
        collection: 'tenant-connections',
        data: {
          tenant: context.tenantId,
          toolkit: toolkit as 'instagram',
          scope,
          ...(scope === 'personal' ? { user: context.user.id } : {}),
          connectedBy: context.user.id,
          authConfigId,
          estado: 'conectando',
        },
        overrideAccess: true,
      })
    }

    revalidatePath(SETTINGS_PATH)
    return { ok: true, redirectUrl }
  } catch (error) {
    return { ok: false, error: safeError(error, 'Error al iniciar la conexión') }
  }
}

/** Verifica la conexión pendiente (login ya completado) y marca `ok`. */
export async function verifyConnectionAction(
  toolkit: string,
  scope: ConnectionScope = 'empresa',
): Promise<ActionResult<{ estado: string }>> {
  try {
    const resolved = resolveScope(toolkit, scope)
    if (resolved === 'invalida') return { ok: false, error: `Alcance no válido para ${toolkit}` }

    const context = await getWorkspaceContext()
    if (scope === 'empresa' && !context.isAdmin) {
      return { ok: false, error: 'Las conexiones de la empresa requieren rol admin' }
    }
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para verificar conexiones' }

    const row = await findTenantConnection(context.tenantId, toolkit, scope, context.user.id)
    if (!row?.authConfigId) return { ok: false, error: 'No hay una conexión iniciada para este servicio' }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) return { ok: false, error: 'Este tenant no tiene API key de Composio asignada' }

    const userId =
      scope === 'personal' ? `${session.userId}:u:${context.user.id}` : session.userId
    const account = await verifyConnection(session.composio, {
      userId,
      toolkit,
      authConfigId: row.authConfigId,
    })

    if (!account) {
      return { ok: false, error: 'Aún no completaste el login — abre el enlace y autoriza el servicio' }
    }

    // Atómico desde la perspectiva de la UI (review Devin): la conexión NO se
    // marca 'ok' hasta que la identidad IG y el espejo tuvieron éxito. Cualquier
    // fallo restaura 'conectando' con el error — siempre reintentable.
    await context.payload.update({
      collection: 'tenant-connections',
      id: row.id,
      data: { connectedAccountId: account.id, estado: 'conectando', ultimoError: null, connectedBy: context.user.id },
      overrideAccess: true,
    })

    try {
      if (toolkit === 'tiktok') {
        // TikTok: la identidad de negocio es el connected account (el adapter
        // de stats no la requiere). Espejo igual que Instagram.
        const byConn = await context.payload.find({
          collection: 'social-accounts',
          where: {
            and: [
              { tenant: { equals: context.tenantId } },
              { platform: { equals: 'tiktok' } },
              { composioConnectedAccountId: { equals: account.id } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const mirrorData = {
          status: 'conectada' as const,
          syncStatus: 'ok' as const,
          composioConnectedAccountId: account.id,
          platformAccountId: account.id,
          lastSyncAt: new Date().toISOString(),
        }
        if (byConn.docs[0]) {
          await context.payload.update({
            collection: 'social-accounts',
            id: byConn.docs[0].id,
            data: mirrorData,
            overrideAccess: true,
          })
        } else {
          await context.payload.create({
            collection: 'social-accounts',
            data: {
              tenant: context.tenantId,
              accountName: 'TikTok (conectado vía Composio)',
              platform: 'tiktok',
              ...mirrorData,
            },
            overrideAccess: true,
          })
        }
      }

      if (toolkit === 'instagram') {
      // Identidad IG REAL (no el connected account de Composio) — la consulta
      // GET_USER_INFO resuelve 'me' para la conexión recién autorizada.
      const { executeTool } = await import('@/integrations/composio/client')
      const { assertToolSuccess, extractIgUserId } = await import('@/lib/social-publish')
      const userInfo = await executeTool(session.composio, {
        toolkit: 'instagram',
        slug: 'INSTAGRAM_GET_USER_INFO',
        userId,
        args: {},
      })
      assertToolSuccess(userInfo, 'GET_USER_INFO')
      const igUserId = extractIgUserId(userInfo)
      if (!igUserId) throw new Error('GET_USER_INFO no devolvió el IG user id')

      // Reconciliar el espejo existente por IDENTIDAD IG (un reconnect genera
      // un connectedAccountId nuevo; la fila vieja marcada desconectada debe
      // revivir y conservar su historial de posts — nunca crear duplicados).
      const byIdentity = await context.payload.find({
        collection: 'social-accounts',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { platform: { equals: 'instagram' } },
            { externalUserId: { equals: igUserId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      let mirrorId: number | null = byIdentity.docs[0]?.id ?? null

      if (!mirrorId) {
        // Sin identidad previa: adoptar la fila Composio-managed desconectada
        // del tenant (reconexión de la misma cuenta antes de conocer su id).
        const previous = await context.payload.find({
          collection: 'social-accounts',
          where: {
            and: [
              { tenant: { equals: context.tenantId } },
              { platform: { equals: 'instagram' } },
              { composioConnectedAccountId: { exists: true } },
              { status: { not_equals: 'conectada' } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        mirrorId = previous.docs[0]?.id ?? null
      }

      const mirrorData = {
        status: 'conectada' as const,
        syncStatus: 'ok' as const,
        composioConnectedAccountId: account.id,
        externalUserId: igUserId,
        platformAccountId: igUserId,
        lastSyncAt: new Date().toISOString(),
      }

      try {
        if (mirrorId) {
          await context.payload.update({
            collection: 'social-accounts',
            id: mirrorId,
            data: mirrorData,
            overrideAccess: true,
          })
        } else {
          await context.payload.create({
            collection: 'social-accounts',
            data: {
              tenant: context.tenantId,
              accountName: 'Instagram (conectado vía Composio)',
              platform: 'instagram',
              ...mirrorData,
            },
            overrideAccess: true,
          })
        }
      } catch (mirrorError) {
        await restorePending(context, row.id, mirrorError)
        return {
          ok: false,
          error: safeError(mirrorError, 'La conexión quedó verificada pero el registro interno falló — reintenta'),
        }
      }
      }

      // Todo tuvo éxito recién AHORA: la conexión queda verificada.
      await context.payload.update({
        collection: 'tenant-connections',
        id: row.id,
        data: { estado: 'ok', ultimoError: null, connectedBy: context.user.id },
        overrideAccess: true,
      })

      revalidatePath(SETTINGS_PATH)
      revalidatePath('/workspace/social')
      return { ok: true, estado: 'ok' }
    } catch (verifyError) {
      await restorePending(context, row.id, verifyError)
      return { ok: false, error: safeError(verifyError, 'Error al verificar la conexión') }
    }
  } catch (error) {
    return { ok: false, error: safeError(error, 'Error al verificar la conexión') }
  }
}

/** Restaura una conexión a 'conectando' con el error — siempre reintentable. */
async function restorePending(
  context: Awaited<ReturnType<typeof getWorkspaceContext>>,
  connectionId: number,
  error: unknown,
): Promise<void> {
  await context.payload
    .update({
      collection: 'tenant-connections',
      id: connectionId,
      data: {
        estado: 'conectando',
        ultimoError: `Verificación incompleta: ${error instanceof Error ? error.message : 'error desconocido'}`,
      },
      overrideAccess: true,
    })
    .catch(() => undefined)
}

/** Prueba la conexión: confirma que el connected account sigue ACTIVO en Composio. */
export async function pingConnectionAction(
  toolkit: string,
  scope: ConnectionScope = 'empresa',
): Promise<ActionResult<{ estado: string }>> {
  try {
    const resolved = resolveScope(toolkit, scope)
    if (resolved === 'invalida') return { ok: false, error: `Alcance no válido para ${toolkit}` }

    const context = await getWorkspaceContext()
    if (scope === 'empresa' && !context.isAdmin) {
      return { ok: false, error: 'Las conexiones de la empresa requieren rol admin' }
    }
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para probar conexiones' }

    const row = await findTenantConnection(context.tenantId, toolkit, scope, context.user.id)
    if (!row || row.estado !== 'ok' || !row.connectedAccountId) {
      return { ok: false, error: 'Este servicio no está conectado' }
    }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) return { ok: false, error: 'Este tenant no tiene API key de Composio asignada' }

    const account = await session.composio.connectedAccounts.get(row.connectedAccountId)
    const status = account?.status ?? 'UNKNOWN'
    if (status.toUpperCase() !== 'ACTIVE') {
      await context.payload.update({
        collection: 'tenant-connections',
        id: row.id,
        data: { estado: 'error_token', ultimoError: `Estado en Composio: ${status}` },
        overrideAccess: true,
      })
      revalidatePath(SETTINGS_PATH)
      return { ok: false, error: `La conexión ya no está activa (Composio: ${status})` }
    }
    return { ok: true, estado: status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido'
    return { ok: false, error: message }
  }
}

/** Desconecta: revoca el connected account en Composio y marca la fila local. */
export async function disconnectConnectionAction(
  toolkit: string,
  scope: ConnectionScope = 'empresa',
): Promise<ActionResult> {
  try {
    const resolved = resolveScope(toolkit, scope)
    if (resolved === 'invalida') return { ok: false, error: `Alcance no válido para ${toolkit}` }

    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para desconectar servicios' }

    const row = await findTenantConnection(context.tenantId, toolkit, scope, context.user.id)
    if (!row) return { ok: false, error: 'No hay conexión para este servicio' }
    if (row.scope === 'empresa' && !context.isAdmin) {
      return { ok: false, error: 'Las conexiones de la empresa requieren rol admin' }
    }

    if (row.connectedAccountId) {
      const session = await getComposioForTenant(context.payload, context.tenantId)
      if (session) {
        // La revocación en Composio no puede bloquear la desconexión local.
        await deleteConnectedAccount(session.composio, row.connectedAccountId).catch(() => undefined)
      }
      if (toolkit === 'instagram') {
        const linked = await context.payload.find({
          collection: 'social-accounts',
          where: {
            and: [
              { tenant: { equals: context.tenantId } },
              { composioConnectedAccountId: { equals: row.connectedAccountId } },
            ],
          },
          limit: 10,
          depth: 0,
          overrideAccess: true,
        })
        for (const doc of linked.docs) {
          await context.payload.update({
            collection: 'social-accounts',
            id: doc.id,
            data: { status: 'desconectada', syncStatus: 'sin_conectar' },
            overrideAccess: true,
          })
        }
      }
    }

    await context.payload.update({
      collection: 'tenant-connections',
      id: row.id,
      data: { estado: 'desconectado', connectedAccountId: null },
      overrideAccess: true,
    })

    revalidatePath(SETTINGS_PATH)
    revalidatePath('/workspace/social')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeError(error, 'Error al desconectar') }
  }
}

/** Tipos auxiliares reutilizados por el hub (filas del tenant activo). */
export type TenantConnectionRow = {
  id: number
  toolkit: string
  scope: 'empresa' | 'personal'
  userId: number | null
  estado: string
  connectedAccountId: string | null
}
