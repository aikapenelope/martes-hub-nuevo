/**
 * POST /api/ai/chat — Hermes AI streaming chat endpoint.
 *
 * Vercel AI SDK v7 + Payload Local API directamente (sin HTTP circular).
 * El agente tiene acceso de solo lectura al CRM del tenant activo.
 *
 * Auth: cookies de sesión Payload (same-origin).
 * Proveedor: ANTHROPIC_API_KEY → Claude 3.5 Haiku | OPENAI_API_KEY → GPT-4o-mini.
 */

import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { headers } from 'next/headers'
import type { Where } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import type { User } from '@/payload-types'

export const maxDuration = 30

// Schemas de parámetros separados para que z.infer<> resuelva sin ambigüedad
const clientesParams = z.object({
  query: z.string().optional(),
  etapa: z.enum(['nuevo', 'activo', 'inactivo', 'perdido']).optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
const leadsParams = z.object({
  query: z.string().optional(),
  estado: z.enum(['nuevo', 'contactado', 'calificado', 'descartado']).optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
const tareasParams = z.object({
  estado: z.enum(['pendiente', 'en_progreso', 'completada', 'bloqueada', 'cancelada']).optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
const emptyParams = z.object({})

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const requestHeaders = await headers()
  const { user: rawUser } = await payload.auth({ headers: requestHeaders })

  if (!rawUser || rawUser.collection !== 'users') {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }
  const user = rawUser as User

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic('claude-3-5-haiku-latest')
    : process.env.OPENAI_API_KEY
      ? openai('gpt-4o-mini')
      : null

  if (!model) {
    return Response.json(
      { error: 'Sin proveedor de IA: configura ANTHROPIC_API_KEY u OPENAI_API_KEY' },
      { status: 503 },
    )
  }

  const membership = user.tenants?.[0]?.tenant
  const tenantId =
    typeof membership === 'object' && membership !== null ? membership.id : membership

  const body = (await req.json()) as { messages?: UIMessage[] }
  const uiMessages: UIMessage[] = body.messages ?? []

  function tw(extra?: Where): Where {
    return tenantId
      ? { and: [{ tenant: { equals: tenantId } } as Where, ...(extra ? [extra] : [])] }
      : (extra ?? {})
  }

  const result = streamText({
    model,
    system: `Eres Hermes, el asistente de Martes Hub. Acceso de solo lectura al CRM (tenant: ${tenantId ?? 'sin asignar'}). Responde en español, sé conciso. Consulta datos antes de dar cifras.`,
    messages: await convertToModelMessages(uiMessages),
    stopWhen: isStepCount(4),
    tools: {
      buscarClientes: tool({
        description: 'Busca clientes del CRM por nombre, email o teléfono.',
        inputSchema: clientesParams,
        execute: async (params: z.infer<typeof clientesParams>): Promise<{ total: number; clientes: { id: number; name: string; stage: string; email?: string | null; phone?: string | null }[] }> => {
          const and: Where[] = [{ tenant: { equals: tenantId } } as Where]
          if (params.etapa) and.push({ stage: { equals: params.etapa } } as Where)
          if (params.query) and.push({ or: [{ name: { like: params.query } }, { email: { like: params.query } }, { phone: { like: params.query } }] } as Where)
          const res = await payload.find({ collection: 'clients', where: tenantId ? { and } : {}, limit: params.limit, depth: 0, overrideAccess: false, user })
          return { total: res.totalDocs, clientes: res.docs.map((d) => ({ id: d.id, name: d.name, stage: d.stage, email: d.email, phone: d.phone })) }
        },
      }),

      buscarLeads: tool({
        description: 'Busca leads en el pipeline por nombre, email o estado.',
        inputSchema: leadsParams,
        execute: async (params: z.infer<typeof leadsParams>): Promise<{ total: number; leads: { id: number; fullName: string; status: string; email?: string | null }[] }> => {
          const and: Where[] = [{ tenant: { equals: tenantId } } as Where]
          if (params.estado) and.push({ status: { equals: params.estado } } as Where)
          if (params.query) and.push({ or: [{ fullName: { like: params.query } }, { email: { like: params.query } }, { phone: { like: params.query } }] } as Where)
          const res = await payload.find({ collection: 'leads', where: tenantId ? { and } : {}, limit: params.limit, depth: 0, overrideAccess: false, user })
          return { total: res.totalDocs, leads: res.docs.map((d) => ({ id: d.id, fullName: d.fullName, status: d.status, email: d.email })) }
        },
      }),

      buscarTareas: tool({
        description: 'Busca tareas por estado, prioridad o texto en el título.',
        inputSchema: tareasParams,
        execute: async (params: z.infer<typeof tareasParams>): Promise<{ total: number; tareas: { id: number; title: string; status: string; priority: string; dueDate?: string | null }[] }> => {
          const and: Where[] = [{ tenant: { equals: tenantId } } as Where]
          if (params.estado) and.push({ status: { equals: params.estado } } as Where)
          if (params.prioridad) and.push({ priority: { equals: params.prioridad } } as Where)
          if (params.query) and.push({ title: { like: params.query } } as Where)
          const res = await payload.find({ collection: 'tasks', where: tenantId ? { and } : {}, limit: params.limit, depth: 0, overrideAccess: false, user })
          return { total: res.totalDocs, tareas: res.docs.map((d) => ({ id: d.id, title: d.title, status: d.status, priority: d.priority, dueDate: d.dueDate })) }
        },
      }),

      resumenCobros: tool({
        description: 'Resumen de pagos: total pendiente, vencidos y últimos pagados.',
        inputSchema: emptyParams,
        execute: async (): Promise<{ pendientes: number; vencidos: number; ultimosPagados: { id: number; amount?: number | null; concept?: string | null; paidAt?: string | null }[] }> => {
          if (!tenantId) return { pendientes: 0, vencidos: 0, ultimosPagados: [] }
          const [pendientes, vencidos, pagados] = await Promise.all([
            payload.find({ collection: 'payments', where: tw({ status: { equals: 'pendiente' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'payments', where: tw({ status: { equals: 'vencido' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'payments', where: tw({ status: { equals: 'pagado' } }), limit: 5, sort: '-paidAt', depth: 0, overrideAccess: false, user }),
          ])
          return { pendientes: pendientes.totalDocs, vencidos: vencidos.totalDocs, ultimosPagados: pagados.docs.map((d) => ({ id: d.id, amount: d.amount, concept: d.concept, paidAt: d.paidAt })) }
        },
      }),

      resumenPipeline: tool({
        description: 'Resumen del pipeline de leads por estado y clientes activos.',
        inputSchema: emptyParams,
        execute: async (): Promise<{ pipeline: { nuevo: number; contactado: number; calificado: number; descartado: number }; clientesActivos: number }> => {
          if (!tenantId) return { pipeline: { nuevo: 0, contactado: 0, calificado: 0, descartado: 0 }, clientesActivos: 0 }
          const [n, ct, ca, d, a] = await Promise.all([
            payload.find({ collection: 'leads', where: tw({ status: { equals: 'nuevo' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'leads', where: tw({ status: { equals: 'contactado' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'leads', where: tw({ status: { equals: 'calificado' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'leads', where: tw({ status: { equals: 'descartado' } }), limit: 0, overrideAccess: false, user }),
            payload.find({ collection: 'clients', where: tw({ stage: { equals: 'activo' } }), limit: 0, overrideAccess: false, user }),
          ])
          return { pipeline: { nuevo: n.totalDocs, contactado: ct.totalDocs, calificado: ca.totalDocs, descartado: d.totalDocs }, clientesActivos: a.totalDocs }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
