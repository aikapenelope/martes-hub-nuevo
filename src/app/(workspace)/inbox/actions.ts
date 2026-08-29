'use server'

import { revalidatePath } from 'next/cache'
import type { Conversation, Tenant } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { sendText, isConfigured } from '@/integrations/openbsp/client'

const WINDOW_MS = 24 * 60 * 60 * 1000

export async function isWindowActiveServer(lastInboundAt?: string | null): Promise<boolean> {
  if (!lastInboundAt) return false
  return Date.now() - new Date(lastInboundAt).getTime() <= WINDOW_MS
}

export async function sendReplyAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) {
      return { success: false, error: 'No tienes permiso para responder mensajes' }
    }

    const conversationIdRaw = formData.get('conversationId')
    const text = (formData.get('text') as string)?.trim()

    const conversationId = Number(conversationIdRaw)
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return { success: false, error: 'ID de conversación inválido' }
    }
    if (!text) {
      return { success: false, error: 'El mensaje no puede estar vacío' }
    }

    const result = await context.payload.find({
      collection: 'conversations',
      where: {
        and: [
          { id: { equals: conversationId } },
          { tenant: { equals: context.tenantId } },
        ],
      },
      limit: 1,
      depth: 1,
      overrideAccess: false,
      user: context.user,
    })

    const conversation = result.docs[0] as Conversation | undefined
    if (!conversation) {
      return { success: false, error: 'Conversación no encontrada en el tenant activo' }
    }

    // Comprobar ventana de 24h
    if (
      !conversation.lastInboundAt ||
      Date.now() - new Date(conversation.lastInboundAt).getTime() > WINDOW_MS
    ) {
      return {
        success: false,
        error: 'Fuera de la ventana de 24h: se requiere enviar una plantilla aprobada por Meta.',
      }
    }

    let openbspId: string | undefined
    let externalId: string | undefined

    if (isConfigured()) {
      const tenant = context.tenant as Tenant
      const row = await sendText({
        to: conversation.contactAddress,
        text,
        tenant,
      })
      openbspId = row.id
      externalId = row.external_id ?? undefined
    }

    await context.payload.create({
      collection: 'messages',
      data: {
        conversation: conversation.id,
        direction: 'outbound',
        type: 'text',
        text,
        content: {},
        sentAt: new Date().toISOString(),
        performedBy: context.user.id,
        tenant: context.tenantId,
        openbspId,
        externalId,
      },
      overrideAccess: true,
    })

    await context.payload.update({
      collection: 'conversations',
      id: conversation.id,
      data: {
        lastMessageAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    revalidatePath('/inbox')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al enviar mensaje'
    return { success: false, error: msg }
  }
}
