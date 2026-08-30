'use client'

/**
 * CopilotAssistant — asistente flotante del workspace (CopilotKit v2).
 * Corre contra `/api/copilotkit` (Vercel Function normal, sin VPS). El
 * modelo se resuelve del lado del servidor (ANTHROPIC_API_KEY →
 * OPENAI_API_KEY → OPENROUTER_API_KEY), nunca en el cliente.
 *
 * Las herramientas (`useFrontendTool`) llaman Server Actions reales —
 * `copilot-actions.ts` — no son un chat de solo lectura: el asistente
 * puede buscar en el CRM, crear tareas y registrar cobros de verdad,
 * siempre respetando `overrideAccess:false` + el usuario autenticado.
 */

import { z } from 'zod'
import { CopilotKit, CopilotSidebar, useFrontendTool } from '@copilotkit/react-core/v2'
import '@copilotkit/react-core/v2/styles.css'

import { copilotCreateTask, copilotRegisterPayment, copilotSearchCrm } from '@/lib/copilot-actions'

function AssistantTools() {
  useFrontendTool({
    name: 'buscarEnCrm',
    description: 'Busca leads o clientes por nombre, email o teléfono. Usa esto siempre antes de crear una tarea o cobro si no tienes el ID exacto.',
    parameters: z.object({ query: z.string().min(2).describe('Texto a buscar: nombre, email o teléfono') }),
    handler: async ({ query }) => {
      const results = await copilotSearchCrm(query)
      if (results.length === 0) return { found: false, message: 'Sin resultados.' }
      return { found: true, results }
    },
  })

  useFrontendTool({
    name: 'crearTarea',
    description: 'Crea una tarea en el workspace. Si la tarea es para un cliente o lead específico, usa buscarEnCrm primero para obtener el ID real.',
    parameters: z.object({
      title: z.string().min(1).describe('Título de la tarea'),
      dueDate: z.string().optional().describe('Fecha límite en formato YYYY-MM-DD'),
      clientId: z.number().int().positive().optional().describe('ID real de un cliente, obtenido de buscarEnCrm'),
      leadId: z.number().int().positive().optional().describe('ID real de un lead, obtenido de buscarEnCrm'),
      priority: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
    }),
    handler: async (args) => copilotCreateTask(args),
  })

  useFrontendTool({
    name: 'registrarCobro',
    description: 'Registra un cobro pendiente para un cliente existente. Requiere el ID real del cliente — usa buscarEnCrm primero.',
    parameters: z.object({
      clientId: z.number().int().positive().describe('ID real de un cliente, obtenido de buscarEnCrm'),
      amount: z.number().positive().describe('Monto en USD'),
      concept: z.string().optional().describe('Concepto del cobro'),
      dueDate: z.string().optional().describe('Fecha de vencimiento en formato YYYY-MM-DD'),
    }),
    handler: async (args) => copilotRegisterPayment(args),
  })

  return null
}

export function CopilotAssistant() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint={false}>
      <AssistantTools />
      <CopilotSidebar
        labels={{
          modalHeaderTitle: 'Asistente del workspace',
          welcomeMessageText: '¿Qué necesitas? Puedo buscar en el CRM, crear tareas o registrar cobros.',
          chatInputPlaceholder: 'Ej: busca a Juan Pérez, o créale una tarea de seguimiento',
        }}
      />
    </CopilotKit>
  )
}
