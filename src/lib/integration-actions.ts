'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { encryptSecret } from '@/lib/crypto'
import {
  createConnectionLink,
  deleteConnectedAccount,
  executeTool,
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

async function currentOrigin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

async function findTenantConnection(
  payload: Awaited<ReturnType<typeof getWorkspaceContext>>['payload'],
  tenantId: number,
  toolkit: string,
): Promise<{
  id: number
  authConfigId: string | null
  connectedAccountId: string | null
  estado: string
} | null> {
  const res = await payload.find({
    collection: 'tenant-connections',
    where: { and: [{ tenant: { equals: tenantId } }, { toolkit: { equals: toolkit } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = res.docs[0]
  if (!doc) return null
  return {
    id: doc.id,
    authConfigId: doc.authConfigId ?? null,
    connectedAccountId: doc.connectedAccountId ?? null,
    estado: doc.estado,
  }
}

/**
 * Guarda (o reemplaza) la API key del proyecto Composio del tenant, cifrada.
 * Valida la key contra la API de Composio antes de guardar — si falla, no se
 * persiste nada. Admin-only: la key da acceso a todo el proyecto del tenant.
 */
export async function saveComposioKeyAction(apiKey: string): Promise<ActionResult> {
  try {
    const trimmed = apiKey.trim()
    if (!trimmed) return { ok: false, error: 'Pega la API key de tu proyecto Composio' }

    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede cambiar la conexión Composio' }

    // Validación real contra Composio (llamada de gestión, no consume tool calls).
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

    revalidatePath(SETTINGS_PATH)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al guardar la API key' }
  }
}

/**
 * Inicia la conexión de un toolkit: get-or-create del auth config gestionado
 * y link hosted para que el tenant loguee en el servicio real. Devuelve el
 * redirectUrl — el cliente redirige. Sin key configurada, error claro.
 */
export async function startConnectionAction(toolkit: string): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    if (!isSupportedToolkit(toolkit)) return { ok: false, error: `Toolkit no soportado: ${toolkit}` }

    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede conectar servicios' }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) {
      return { ok: false, error: 'Primero configura la API key de tu proyecto Composio en Ajustes' }
    }

    const authConfigId = await getOrCreateManagedAuthConfig(session.composio, toolkit)
    const origin = await currentOrigin()
    const { redirectUrl } = await createConnectionLink(session.composio, {
      userId: session.userId,
      authConfigId,
      toolkit,
      callbackUrl: `${origin}${SETTINGS_PATH}`,
    })

    // Fila determinista (tenant + toolkit): guarda el auth config esperado para
    // que la verificación filtre por él — nunca "la primera cuenta de la lista".
    const existing = await findTenantConnection(context.payload, context.tenantId, toolkit)
    if (existing) {
      await context.payload.update({
        collection: 'tenant-connections',
        id: existing.id,
        data: { authConfigId, estado: 'conectando', ultimoError: null },
        overrideAccess: true,
      })
    } else {
      await context.payload.create({
        collection: 'tenant-connections',
        data: { tenant: context.tenantId, toolkit, authConfigId, estado: 'conectando' },
        overrideAccess: true,
      })
    }

    revalidatePath(SETTINGS_PATH)
    return { ok: true, redirectUrl }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al iniciar la conexión' }
  }
}

/**
 * Verifica la conexión pendiente de un toolkit: filtra los connected accounts
 * por el authConfigId esperado y, si ya completó el login, marca `ok` y hace
 * upsert del espejo (social-accounts para Instagram).
 */
export async function verifyConnectionAction(toolkit: string): Promise<ActionResult<{ estado: string }>> {
  try {
    if (!isSupportedToolkit(toolkit)) return { ok: false, error: `Toolkit no soportado: ${toolkit}` }

    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede verificar conexiones' }

    const row = await findTenantConnection(context.payload, context.tenantId, toolkit)
    if (!row?.authConfigId) return { ok: false, error: 'No hay una conexión iniciada para este servicio' }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) return { ok: false, error: 'Falta la API key de Composio del tenant' }

    const account = await verifyConnection(session.composio, {
      userId: session.userId,
      toolkit,
      authConfigId: row.authConfigId,
    })

    if (!account) {
      return { ok: false, error: 'Aún no completaste el login — abre el enlace y autoriza el servicio' }
    }

    await context.payload.update({
      collection: 'tenant-connections',
      id: row.id,
      data: { connectedAccountId: account.id, estado: 'ok', ultimoError: null },
      overrideAccess: true,
    })

    if (toolkit === 'instagram') {
      const linked = await context.payload.find({
        collection: 'social-accounts',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { composioConnectedAccountId: { equals: account.id } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (!linked.docs[0]) {
        await context.payload.create({
          collection: 'social-accounts',
          data: {
            tenant: context.tenantId,
            accountName: 'Instagram (conectado vía Composio)',
            platform: 'instagram',
            platformAccountId: account.id,
            status: 'conectada',
            syncStatus: 'ok',
            composioConnectedAccountId: account.id,
            lastSyncAt: new Date().toISOString(),
          },
          overrideAccess: true,
        })
      }
    }

    revalidatePath(SETTINGS_PATH)
    revalidatePath('/workspace/social')
    return { ok: true, estado: 'ok' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error al verificar la conexión' }
  }
}

/** Desconecta un toolkit: revoca el connected account en Composio y marca la fila. */
export async function disconnectConnectionAction(toolkit: string): Promise<ActionResult> {
  try {
    if (!isSupportedToolkit(toolkit)) return { ok: false, error: `Toolkit no soportado: ${toolkit}` }

    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede desconectar servicios' }

    const row = await findTenantConnection(context.payload, context.tenantId, toolkit)
    if (!row) return { ok: false, error: 'No hay conexión para este servicio' }

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
    return { ok: false, error: error instanceof Error ? error.message : 'Error al desconectar' }
  }
}

/**
 * Ping de verificación de credencial: ejecuta una acción de lectura barata del
 * toolkit conectado. Devuelve el error crudo de Composio — sin fallback.
 */
export async function pingConnectionAction(toolkit: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const context = await getWorkspaceContext()
    if (!context.isAdmin) return { ok: false, error: 'Solo un admin puede probar conexiones' }

    const row = await findTenantConnection(context.payload, context.tenantId, toolkit)
    const connectedAccountId = row?.connectedAccountId
    if (!row || row.estado !== 'ok' || !connectedAccountId) {
      return { ok: false, error: 'Este servicio no está conectado' }
    }

    const session = await getComposioForTenant(context.payload, context.tenantId)
    if (!session) return { ok: false, error: 'Falta la API key de Composio del tenant' }

    const slug = toolkit === 'instagram' ? 'INSTAGRAM_GET_USER_INFO' : null
    if (!slug) return { ok: true }

    await executeTool(session.composio, { toolkit, slug, userId: session.userId, args: {} })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error desconocido'
    return { ok: false, error: message }
  }
}

/** Tipos auxiliares reutilizados por el hub (filas del tenant activo). */
export type TenantConnectionRow = {
  id: number
  toolkit: string
  estado: string
  connectedAccountId: string | null
}
