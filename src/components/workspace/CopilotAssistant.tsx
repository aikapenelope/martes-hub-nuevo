'use client'

/**
 * CopilotAssistant — asistente flotante del workspace (CopilotKit v2).
 * Corre contra `/api/copilotkit` (Vercel Function normal, sin VPS). El
 * modelo se resuelve del lado del servidor (ANTHROPIC_API_KEY →
 * OPENAI_API_KEY → OPENROUTER_API_KEY), nunca en el cliente.
 *
 * Las herramientas (`useFrontendTool`) llaman Server Actions reales —
 * `copilot-actions.ts` — no son un chat de solo lectura: el asistente
 * puede buscar en el CRM, registrar prospectos, actualizar estados,
 * crear tareas y registrar cobros de verdad.
 */

import { z } from 'zod'
import { CopilotKit, CopilotSidebar, useFrontendTool } from '@copilotkit/react-core/v2'
import '@copilotkit/react-core/v2/styles.css'

import {
  copilotCreateLead,
  copilotCreateTask,
  copilotRegisterPayment,
  copilotSearchCrm,
  copilotUpdateLeadStage,
} from '@/lib/copilot-actions'

function AssistantTools() {
  useFrontendTool({
    name: 'buscarEnCrm',
    description: 'Busca prospectos (leads) o clientes por nombre, email o teléfono. Usa esto siempre antes de crear una tarea o cobro si no tienes el ID exacto.',
    parameters: z.object({ query: z.string().min(2).describe('Texto a buscar: nombre, email o teléfono') }),
    handler: async ({ query }) => {
      const results = await copilotSearchCrm(query)
      if (results.length === 0) return { found: false, message: 'Sin resultados.' }
      return { found: true, results }
    },
  })

  useFrontendTool({
    name: 'crearProspecto',
    description: 'Crea un nuevo prospecto (lead) en el CRM con datos de contacto, empresa, origen (Google Maps, puerta fría, WhatsApp, etc.), ciudad y valor estimado.',
    parameters: z.object({
      fullName: z.string().min(1).describe('Nombre de la persona o contacto'),
      companyName: z.string().optional().describe('Nombre de la empresa o negocio'),
      phone: z.string().optional().describe('Teléfono / WhatsApp internacional sin +'),
      email: z.string().optional().describe('Correo electrónico'),
      source: z.enum([
        'manual',
        'google_maps',
        'puerta_fria',
        'whatsapp',
        'instagram_dm',
        'linkedin',
        'tally',
        'apify',
        'referido',
      ]).optional().describe('Canal de origen donde se descubrió el prospecto'),
      city: z.string().optional().describe('Ciudad donde opera el negocio'),
      estimatedValue: z.number().positive().optional().describe('Valor estimado de la oportunidad en USD'),
      commercialNotes: z.string().optional().describe('Comentarios comerciales, objeciones o acuerdos'),
    }),
    handler: async (args) => copilotCreateLead(args),
  })

  useFrontendTool({
    name: 'actualizarEtapaLead',
    description: 'Actualiza la etapa de un lead (nuevo, contactado, calificado, descartado) y agrega notas comerciales tras una llamada, reunión o chat.',
    parameters: z.object({
      leadId: z.number().int().positive().describe('ID numérico del lead en el CRM'),
      status: z.enum(['nuevo', 'contactado', 'calificado', 'descartado']).describe('Nueva etapa del pipeline'),
      notes: z.string().optional().describe('Notas o comentarios de lo conversado'),
    }),
    handler: async (args) => copilotUpdateLeadStage(args),
  })

  useFrontendTool({
    name: 'crearTarea',
    description: 'Crea una tarea interna en el workspace vinculada opcionalmente a un cliente o lead.',
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
          modalHeaderTitle: 'Copiloto Comercial Martes Hub',
          welcomeMessageText: '¡Hola! Soy tu asistente de operaciones y CRM. Puedo crear prospectos, buscar en el CRM, cambiar etapas de leads, crear tareas o registrar cobros.',
          chatInputPlaceholder: 'Ej: Registra un lead de Google Maps llamado Restaurante La Terraza, o busca a María',
        }}
      />
    </CopilotKit>
  )
}
