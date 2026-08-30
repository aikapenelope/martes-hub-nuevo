'use server'

/**
 * Acciones que el asistente de IA (CopilotKit, ver CopilotAssistant.tsx)
 * puede ejecutar de verdad — no son un chat de solo lectura. Reciben
 * argumentos tipados (no FormData, a diferencia de las Server Actions de
 * formularios) porque `useFrontendTool` les pasa los argumentos que el
 * modelo extrajo de la conversación. Mismo patrón de auth/tenant-scoping
 * que crm-actions.ts / billing-actions.ts: overrideAccess:false + user.
 */

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority } from '@/lib/tasks-filters'
import type { Client, Lead } from '@/payload-types'

export interface CopilotSearchResult {
  type: 'lead' | 'client'
  id: number
  name: string
  contact: string
}

/** Busca leads/clientes por nombre, email o teléfono — misma lógica que workspaceSearch.ts. */
export async function copilotSearchCrm(query: string): Promise<CopilotSearchResult[]> {
  const context = await getWorkspaceContext()
  const q = query.trim().slice(0, 120)
  if (q.length < 2) return []

  const [leadsRes, clientsRes] = await Promise.all([
    context.payload.find({
      collection: 'leads',
      limit: 5,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { or: [{ fullName: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
        ],
      },
    }),
    context.payload.find({
      collection: 'clients',
      limit: 5,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: {
        and: [
          { tenant: { equals: context.tenantId } },
          { or: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
        ],
      },
    }),
  ])

  return [
    ...(leadsRes.docs as Lead[]).map((l) => ({ type: 'lead' as const, id: l.id, name: l.fullName, contact: l.email || l.phone || 'sin contacto' })),
    ...(clientsRes.docs as Client[]).map((c) => ({ type: 'client' as const, id: c.id, name: c.name, contact: c.email || c.phone || 'sin contacto' })),
  ]
}

/** Crea una tarea. `clientId`/`leadId` deben venir de un resultado real de copilotSearchCrm — nunca inventados por el modelo. */
export async function copilotCreateTask(args: {
  title: string
  dueDate?: string
  clientId?: number
  leadId?: number
  priority?: string
}): Promise<{ ok: true; taskId: number } | { ok: false; error: string }> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para crear tareas' }

    const title = args.title.trim().slice(0, 180)
    if (!title) return { ok: false, error: 'El título es obligatorio' }

    const priority: TaskPriority = TASK_PRIORITIES.includes(args.priority as TaskPriority)
      ? (args.priority as TaskPriority)
      : 'media'

    if (args.clientId) {
      const check = await context.payload.find({
        collection: 'clients',
        limit: 1,
        depth: 0,
        overrideAccess: false,
        user: context.user,
        where: { and: [{ id: { equals: args.clientId } }, { tenant: { equals: context.tenantId } }] },
      })
      if (check.docs.length === 0) return { ok: false, error: 'Ese cliente no existe en el tenant activo' }
    }
    if (args.leadId) {
      const check = await context.payload.find({
        collection: 'leads',
        limit: 1,
        depth: 0,
        overrideAccess: false,
        user: context.user,
        where: { and: [{ id: { equals: args.leadId } }, { tenant: { equals: context.tenantId } }] },
      })
      if (check.docs.length === 0) return { ok: false, error: 'Ese lead no existe en el tenant activo' }
    }

    const task = await context.payload.create({
      collection: 'tasks',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        title,
        status: TASK_STATUSES[0],
        priority,
        source: 'manual',
        dueDate: args.dueDate ? new Date(args.dueDate).toISOString() : undefined,
        client: args.clientId,
        lead: args.leadId,
      },
    })

    revalidatePath('/workspace/tasks')
    revalidatePath('/workspace')
    return { ok: true, taskId: task.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' }
  }
}

/** Registra un cobro para un cliente existente. */
export async function copilotRegisterPayment(args: {
  clientId: number
  amount: number
  concept?: string
  dueDate?: string
}): Promise<{ ok: true; paymentId: number } | { ok: false; error: string }> {
  try {
    const context = await getWorkspaceContext()
    if (!context.canEdit) return { ok: false, error: 'No tienes permiso para registrar cobros' }

    if (!Number.isFinite(args.amount) || args.amount <= 0) return { ok: false, error: 'El monto debe ser mayor a 0' }

    const check = await context.payload.find({
      collection: 'clients',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: { and: [{ id: { equals: args.clientId } }, { tenant: { equals: context.tenantId } }] },
    })
    if (check.docs.length === 0) return { ok: false, error: 'Ese cliente no existe en el tenant activo' }

    const payment = await context.payload.create({
      collection: 'payments',
      overrideAccess: false,
      user: context.user,
      data: {
        client: args.clientId,
        amount: args.amount,
        concept: args.concept?.trim().slice(0, 240),
        dueDate: args.dueDate ? new Date(args.dueDate).toISOString() : new Date().toISOString(),
        status: 'pendiente',
      },
    })

    revalidatePath('/workspace/billing')
    revalidatePath('/workspace')
    return { ok: true, paymentId: payment.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' }
  }
}
