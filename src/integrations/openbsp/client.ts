/**
 * Cliente PostgREST para la instancia HOSTED de OpenBSP.
 * Regla de auth: dos headers SIEMPRE (apikey + api-key). Nunca Authorization Bearer.
 * Docs: docs/plan-openbsp.md
 */

import crypto from 'crypto'

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

/**
 * Genera un UUID determinista conforme a RFC 4122 (v4 variant) derivado del hash
 * SHA-256 de una semilla. Permite correlación unívoca e idempotente en OpenBSP.
 */
export function toDeterministicUuid(seed: string): string {
  const hash = crypto.createHash('sha256').update(seed).digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-')
}

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

/**
 * Consulta un mensaje en OpenBSP por su ID (UUID) para reconciliar
 * estados ambiguos de red o claims en vuelo sin re-despachar a ciegas.
 */
export async function findMessageById(
  id: string,
  tenant?: { openbspOrganizationId?: string | null; openbspPhoneNumberId?: string | null } | null,
): Promise<OpenBSPMessageRow | null> {
  const cfg = config(tenant)
  const res = await fetch(
    `${cfg.baseUrl}/rest/v1/messages?id=eq.${encodeURIComponent(id)}&select=id,external_id,status`,
    {
      headers: {
        apikey: cfg.publishableKey,
        'api-key': cfg.apiKey,
        Accept: 'application/json',
      },
    },
  )
  if (!res.ok) {
    throw new Error(`OpenBSP ${res.status} al consultar mensaje ${id}`)
  }
  const rows = (await res.json()) as OpenBSPMessageRow[]
  return rows[0] ?? null
}

async function insertMessageRow(cfg: OpenBSPConfig, row: Record<string, unknown>): Promise<OpenBSPMessageRow> {
  const res = await fetch(`${cfg.baseUrl}/rest/v1/messages`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    // Si OpenBSP ya aceptó la fila previamente (conflicto 409 con el UUID del cliente),
    // recuperamos el registro existente en lugar de fallar, asegurando idempotencia provider-side.
    if (res.status === 409 && typeof row.id === 'string') {
      try {
        const existing = await findMessageById(row.id, { openbspOrganizationId: cfg.organizationId })
        if (existing) return existing
      } catch {
        // Fallback a propagar error si la lectura falla
      }
    }
    const err = new Error(`OpenBSP ${res.status}: ${body.slice(0, 300)}`) as Error & { status?: number }
    err.status = res.status
    throw err
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
  /** Identificador determinista opcional para idempotencia nativa en el proveedor */
  clientMessageId?: string
  /** Clave local de idempotencia para derivar el clientMessageId si no se provee */
  idempotencyKey?: string
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

  const clientMessageId =
    args.clientMessageId ||
    (args.idempotencyKey
      ? toDeterministicUuid(`openbsp:${cfg.organizationId}:${args.to}:${args.idempotencyKey}`)
      : undefined)

  const row: Record<string, unknown> = {
    organization_id: cfg.organizationId,
    organization_address: senderAddress || args.tenant?.openbspPhoneNumberId || cfg.phoneNumberId,
    conversation_address: args.to,
    service,
    content: { version: '1', type: 'text', kind: 'text', text: args.text },
  }
  if (clientMessageId) {
    row.id = clientMessageId
  }

  return insertMessageRow(cfg, row)
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
