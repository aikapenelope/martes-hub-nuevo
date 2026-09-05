/**
 * Cliente PostgREST para la instancia HOSTED de OpenBSP.
 * Regla de auth: dos headers SIEMPRE (apikey + api-key). Nunca Authorization Bearer.
 * Docs: docs/plan-openbsp.md
 */

const DEFAULT_SUPABASE_URL = 'https://nheelwshzbgenpavwhcy.supabase.co'

export interface OpenBSPConfig {
  baseUrl: string
  publishableKey: string
  apiKey: string
  organizationId: string
  phoneNumberId: string
}

export interface OpenBSPMessageRow {
  id: string
  external_id: string | null
  status: Record<string, unknown> | null
  [key: string]: unknown
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export function isConfigured(): boolean {
  return Boolean(
    process.env.OPENBSP_API_KEY &&
      process.env.OPENBSP_PUBLISHABLE_KEY &&
      process.env.OPENBSP_ORG_ID,
  )
}

function config(
  tenant?: { openbspOrganizationId?: string | null; openbspPhoneNumberId?: string | null } | null,
): OpenBSPConfig {
  const baseUrl = process.env.OPENBSP_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const publishableKey = process.env.OPENBSP_PUBLISHABLE_KEY
  const apiKey = process.env.OPENBSP_API_KEY
  const organizationId = tenant?.openbspOrganizationId || process.env.OPENBSP_ORG_ID
  const phoneNumberId =
    tenant?.openbspPhoneNumberId || process.env.OPENBSP_PHONE_NUMBER_ID || ''

  if (!publishableKey || !apiKey || !organizationId) {
    throw new Error('OpenBSP no configurado: faltan OPENBSP_API_KEY / OPENBSP_PUBLISHABLE_KEY / organización')
  }

  return { baseUrl, publishableKey, apiKey, organizationId, phoneNumberId }
}

function headers(cfg: OpenBSPConfig): HeadersInit {
  return {
    apikey: cfg.publishableKey,
    'api-key': cfg.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.pgrst.object+json',
    Prefer: 'return=representation',
  }
}

async function insertMessageRow(cfg: OpenBSPConfig, row: Record<string, unknown>): Promise<OpenBSPMessageRow> {
  const res = await fetch(`${cfg.baseUrl}/rest/v1/messages`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenBSP ${res.status}: ${body.slice(0, 300)}`)
  }
  return (await res.json()) as OpenBSPMessageRow
}

export type OpenBSPService = 'whatsapp' | 'instagram_dm'

interface SendBase {
  to: string // conversation_address, E.164 sin + (o ID de usuario IG)
  tenant?: { openbspOrganizationId?: string | null; openbspPhoneNumberId?: string | null } | null
  service?: OpenBSPService
  // Remitente explícito (organization_address) de la cuenta por la que llegó el mensaje
  // entrante. Requerido para instagram_dm; para whatsapp se usa el phone_number_id.
  senderAddress?: string
}

export async function sendText(
  args: SendBase & { text: string; service?: OpenBSPService },
): Promise<OpenBSPMessageRow> {
  const cfg = config(args.tenant)
  const service = args.service ?? 'whatsapp'

  if (service === 'whatsapp') {
    if (!cfg.phoneNumberId && !args.tenant?.openbspPhoneNumberId) {
      throw new Error('Falta phone_number_id del tenant')
    }
  }

  // Nunca usar el phone_number_id de WhatsApp como remitente de Instagram:
  // respondería desde la cuenta equivocada o fallaría en OpenBSP.
  const senderAddress =
    args.senderAddress ||
    (service === 'instagram_dm' ? process.env.OPENBSP_INSTAGRAM_ID || '' : undefined)
  if (service === 'instagram_dm' && !senderAddress) {
    throw new Error(
      'No se puede responder por Instagram: falta organization_address de la conversación entrante (o OPENBSP_INSTAGRAM_ID)',
    )
  }

  return insertMessageRow(cfg, {
    organization_id: cfg.organizationId,
    organization_address: senderAddress || args.tenant?.openbspPhoneNumberId || cfg.phoneNumberId,
    conversation_address: args.to,
    service,
    content: { version: '1', type: 'text', kind: 'text', text: args.text },
  })
}

export async function sendMedia(
  args: SendBase & {
    kind: MediaKind
    uri: string
    mimeType: string
    name?: string
    size?: number
    caption?: string
  },
): Promise<OpenBSPMessageRow> {
  const cfg = config(args.tenant)
  return insertMessageRow(cfg, {
    organization_id: cfg.organizationId,
    organization_address: args.tenant?.openbspPhoneNumberId || cfg.phoneNumberId,
    conversation_address: args.to,
    service: 'whatsapp',
    content: {
      version: '1',
      type: 'file',
      kind: args.kind,
      file: { mime_type: args.mimeType, uri: args.uri, name: args.name, size: args.size },
      text: args.caption,
    },
  })
}

export async function sendTemplate(
  args: SendBase & {
    templateName: string
    languageCode: string
    parameters: Array<{ type: 'text'; text: string }>,
  },
): Promise<OpenBSPMessageRow> {
  const cfg = config(args.tenant)
  return insertMessageRow(cfg, {
    organization_id: cfg.organizationId,
    organization_address: args.tenant?.openbspPhoneNumberId || cfg.phoneNumberId,
    conversation_address: args.to,
    service: 'whatsapp',
    content: {
      version: '1',
      type: 'data',
      kind: 'template',
      data: {
        name: args.templateName,
        language: { code: args.languageCode },
        parameters: args.parameters,
      },
    },
  })
}

export interface OpenBSPTemplate {
  id: string
  name: string
  language: string | { code: string }
  status?: string
  category?: string
  components?: unknown[]
  [key: string]: unknown
}

/** Lista plantillas registradas bajo la WABA del org (para el job de sync diario). */
export async function listTemplates(): Promise<OpenBSPTemplate[]> {
  const cfg = config()
  const res = await fetch(`${cfg.baseUrl}/rest/v1/templates?select=*`, {
    headers: {
      apikey: cfg.publishableKey,
      'api-key': cfg.apiKey,
    },
  })
  if (!res.ok) {
    throw new Error(`OpenBSP ${res.status} al listar plantillas`)
  }
  const rows = (await res.json()) as OpenBSPTemplate[]
  return Array.isArray(rows) ? rows : []
}
