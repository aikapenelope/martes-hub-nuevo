'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

const CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const

/**
 * Registra manualmente una plantilla de WhatsApp que ya existe aprobada
 * en Meta (el sync diario `sync-templates` la traería de todos modos, esto
 * es para no esperar hasta las 12:30 si se necesita antes). `metaStatus` no
 * se toca aquí — el sync es la única fuente de verdad de si Meta la aprobó.
 */
export async function createMessageTemplateAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para registrar plantillas')

  const name = formData.get('name')
  const language = formData.get('language')
  if (typeof name !== 'string' || !name.trim()) throw new Error('El nombre (Meta) es obligatorio')
  if (typeof language !== 'string' || !language.trim()) throw new Error('El idioma es obligatorio')

  const categoryRaw = formData.get('category')
  const category = CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number])
    ? (categoryRaw as (typeof CATEGORIES)[number])
    : undefined

  const bodyText = formData.get('bodyText')
  const openbspTemplateId = formData.get('openbspTemplateId')

  await context.payload.create({
    collection: 'message-templates',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: name.trim().slice(0, 160),
      language: language.trim().slice(0, 10),
      category,
      bodyText: typeof bodyText === 'string' && bodyText.trim() ? bodyText.trim().slice(0, 2000) : undefined,
      openbspTemplateId: typeof openbspTemplateId === 'string' && openbspTemplateId.trim() ? openbspTemplateId.trim().slice(0, 160) : undefined,
    },
  })

  revalidatePath('/workspace/templates')
}
