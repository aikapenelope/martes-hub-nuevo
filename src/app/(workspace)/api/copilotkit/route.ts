import type { NextRequest } from 'next/server'
import { headers as nextHeaders } from 'next/headers'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { streamText, type LanguageModel } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai, createOpenAI } from '@ai-sdk/openai'
import { checkUserActionRateLimit } from '@/endpoints/rateLimit'
import {
  BuiltInAgent,
  CopilotRuntime,
  InMemoryAgentRunner,
  convertMessagesToVercelAISDKMessages,
  createCopilotRuntimeHandler,
} from '@copilotkit/runtime/v2'

// Este workspace maneja datos personales de clientes (nombres, teléfonos,
// notas comerciales) — se desactiva la telemetría anónima de CopilotKit por
// defecto. Se puede reactivar explícitamente con COPILOTKIT_TELEMETRY_DISABLED=false.
if (process.env.COPILOTKIT_TELEMETRY_DISABLED === undefined) {
  process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true'
}

/**
 * Backend del asistente del workspace — corre como una ruta de API normal
 * de Next.js (Vercel Function serverless, NO requiere VPS ni proceso
 * persistente). Reutiliza exactamente el mismo orden de resolución de
 * proveedor que `crm-pipeline-actions.ts` (ANTHROPIC_API_KEY → OPENAI_API_KEY),
 * y además soporta OPENROUTER_API_KEY vía el mismo `createOpenAI({ baseURL })`
 * que usa cualquier endpoint compatible con OpenAI (OpenRouter, Groq, un
 * proxy propio, etc.) — no hay proveedor "de CopilotKit" que instalar.
 */
function resolveModel(): LanguageModel | null {
  if (process.env.ANTHROPIC_API_KEY) return anthropic('claude-3-5-haiku-latest')
  if (process.env.OPENAI_API_KEY) return openai('gpt-4o-mini')
  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    })
    return openrouter(process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-haiku')
  }
  return null
}

const SYSTEM_PROMPT = `Eres el asistente del workspace de Martes Hub, un CRM interno. Ayudas a
buscar leads/clientes, crear tareas y registrar cobros usando las acciones
disponibles en la conversación. Nunca inventes IDs de cliente o lead: si
necesitas uno, primero usa la acción de búsqueda y usa el ID real que
devuelva. Responde en español, de forma breve y directa.`

const agent = new BuiltInAgent({
  type: 'aisdk',
  factory: async ({ input, abortSignal }) => {
    const model = resolveModel()
    if (!model) throw new Error('Sin proveedor de IA configurado: define ANTHROPIC_API_KEY, OPENAI_API_KEY u OPENROUTER_API_KEY')
    return streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertMessagesToVercelAISDKMessages(input.messages),
      // Techo de tokens por respuesta: sin límite, un script del propio
      // usuario autenticado puede quemar la cuota del proveedor sin control
      // (OWASP LLM10 — unbounded consumption).
      maxOutputTokens: 2048,
      abortSignal,
    })
  },
})

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
})

const runtimeHandler = createCopilotRuntimeHandler({ runtime, basePath: '/api/copilotkit' })

/**
 * Verifica sesión de Payload antes de dejar pasar cualquier request al runtime
 * y devuelve el usuario para el rate limit por usuario.
 */
async function requireAuthenticatedUser(): Promise<{ user: { id: number } } | Response> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  // Rate limit por usuario (mismo mecanismo que crm-pipeline-actions para
  // whatsapp/email/ai-summary). Protege el coste de LLM por cuenta comprometida
  // o automatizada.
  if (!(await checkUserActionRateLimit(user.id, 'copilot'))) {
    return Response.json({ error: 'Demasiadas peticiones al asistente' }, { status: 429 })
  }

  return { user }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser()
  if (isResponse(auth)) return auth
  return runtimeHandler(req)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser()
  if (isResponse(auth)) return auth
  return runtimeHandler(req)
}
