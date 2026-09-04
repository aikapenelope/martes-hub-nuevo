import { createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import type { Payload } from 'payload'
import type { CompanySetting } from '@/payload-types'

export interface TenantAiConfig {
  provider: 'groq' | 'openrouter' | 'custom'
  apiKey: string | null
  model: string
  autoSummarize: boolean
}

export interface ResolvedTenantAi {
  model: LanguageModel
  provider: string
  modelName: string
}

const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct',
  custom: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
}

/**
 * Recupera la configuración de IA para el tenant dado desde `company-settings`.
 */
export async function getTenantAiConfig(
  payload: Payload,
  tenantId: number,
): Promise<TenantAiConfig> {
  const res = await payload.find({
    collection: 'company-settings',
    where: { tenant: { equals: tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const settings = res.docs[0] as CompanySetting | undefined

  return {
    provider: (settings?.aiProvider as 'groq' | 'openrouter' | 'custom') || 'groq',
    apiKey: settings?.aiApiKey?.trim() || null,
    model: settings?.aiModel?.trim() || DEFAULT_MODELS[settings?.aiProvider || 'groq'] || 'llama-3.3-70b-versatile',
    autoSummarize: settings?.aiAutoSummarize ?? true,
  }
}

/**
 * Resuelve e instancia el cliente y modelo de IA para el tenant.
 *
 * Prioridad de resolución:
 * 1. Clave y proveedor configurados en CompanySettings del tenant en el Dashboard.
 * 2. Fallback a variables de entorno para el proveedor elegido (GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY).
 * 3. Fallback general a cualquier proveedor disponible en entorno (Groq -> OpenRouter -> OpenAI -> Anthropic).
 *
 * Retorna null si no hay ningún proveedor configurado ni claves disponibles.
 */
export async function getTenantAiModel(
  payload: Payload,
  tenantId: number,
): Promise<ResolvedTenantAi | null> {
  const config = await getTenantAiConfig(payload, tenantId)

  // 1. Verificar si hay clave explícita para el proveedor seleccionado
  let activeProvider = config.provider
  let apiKey = config.apiKey
  let modelName = config.model

  if (!apiKey) {
    if (activeProvider === 'groq' && process.env.GROQ_API_KEY) {
      apiKey = process.env.GROQ_API_KEY
    } else if (activeProvider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      apiKey = process.env.OPENROUTER_API_KEY
    } else if (activeProvider === 'custom' && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY
    }
  }

  // 2. Fallbacks de entorno si el proveedor seleccionado no tiene clave
  if (!apiKey) {
    if (process.env.GROQ_API_KEY) {
      activeProvider = 'groq'
      apiKey = process.env.GROQ_API_KEY
      modelName = DEFAULT_MODELS.groq
    } else if (process.env.OPENROUTER_API_KEY) {
      activeProvider = 'openrouter'
      apiKey = process.env.OPENROUTER_API_KEY
      modelName = DEFAULT_MODELS.openrouter
    } else if (process.env.OPENAI_API_KEY) {
      activeProvider = 'custom'
      apiKey = process.env.OPENAI_API_KEY
      modelName = DEFAULT_MODELS.custom
    } else if (process.env.ANTHROPIC_API_KEY) {
      const model = anthropic(DEFAULT_MODELS.anthropic)
      return {
        model,
        provider: 'anthropic',
        modelName: DEFAULT_MODELS.anthropic,
      }
    } else {
      return null
    }
  }

  // 3. Instanciar según el proveedor OpenAI-compatible
  if (activeProvider === 'groq') {
    const groq = createOpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })
    return {
      model: groq(modelName || DEFAULT_MODELS.groq),
      provider: 'groq',
      modelName: modelName || DEFAULT_MODELS.groq,
    }
  }

  if (activeProvider === 'openrouter') {
    const openrouter = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    })
    return {
      model: openrouter(modelName || DEFAULT_MODELS.openrouter),
      provider: 'openrouter',
      modelName: modelName || DEFAULT_MODELS.openrouter,
    }
  }

  // custom / OpenAI
  const custom = createOpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  })
  return {
    model: custom(modelName || DEFAULT_MODELS.custom),
    provider: 'custom',
    modelName: modelName || DEFAULT_MODELS.custom,
  }
}
