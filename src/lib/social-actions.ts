'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

const MAX_NAME = 160
const MAX_CAPTION = 2200

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalText(formData: FormData, key: string, max: number): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().slice(0, max)
}

/**
 * Conecta una cuenta social (referencia — sin credenciales, ver
 * SocialAccounts.ts) directamente desde el workspace, reemplazando el
 * link a `/admin/collections/social-accounts/create`. La colección
 * requiere rol admin para crear/editar (`access.create: adminOnly`), así
 * que esta acción exige lo mismo.
 */
export async function createSocialAccountAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.isAdmin) throw new Error('Conectar una cuenta social requiere rol admin')

  const platform = requiredText(formData, 'platform', 20)
  if (platform !== 'instagram' && platform !== 'facebook') throw new Error('Plataforma inválida')

  await context.payload.create({
    collection: 'social-accounts',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      accountName: requiredText(formData, 'accountName', MAX_NAME),
      platform,
      platformAccountId: requiredText(formData, 'platformAccountId', MAX_NAME),
      status: 'conectada',
      profilePictureUrl: optionalText(formData, 'profilePictureUrl', 500),
    },
  })

  revalidatePath('/workspace/social')
}

/**
 * Crea (borrador o programado) una publicación social desde el workspace,
 * reemplazando el link a `/admin/collections/social-posts/create`. La
 * publicación real la hace el agente MCP conectado a Metricool/Composio
 * (ver README) — este formulario solo deja el contenido listo.
 */
export async function createSocialPostAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para crear publicaciones')

  const accountId = Number(formData.get('account'))
  if (!Number.isInteger(accountId) || accountId <= 0) throw new Error('Selecciona una cuenta de destino')

  const accountCheck = await context.payload.find({
    collection: 'social-accounts',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: accountId } }, { tenant: { equals: context.tenantId } }] },
  })
  if (accountCheck.docs.length === 0) throw new Error('Cuenta social no encontrada en el tenant activo')

  const scheduledAtRaw = optionalText(formData, 'scheduledAt', 30)

  await context.payload.create({
    collection: 'social-posts',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      caption: requiredText(formData, 'caption', MAX_CAPTION),
      account: accountId,
      status: scheduledAtRaw ? 'programado' : 'borrador',
      scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : undefined,
    },
  })

  revalidatePath('/workspace/social')
}
