import type { Composio } from '@composio/core'

import { splitAddresses, type GmailMessageSummary } from '../gmail/client'
import { executeTool } from './client'

/**
 * Adapter Gmail vía Composio — devuelve los MISMOS shapes que el cliente
 * env-based (`../gmail/client`), así que el job `sync-email` no cambia su
 * lógica de espejo/matching: solo el transporte.
 *
 * Acción: GMAIL_FETCH_EMAILS (reemplaza a GMAIL_LIST_MESSAGES deprecada) con
 * `include_payload` para traer headers/snippet en una sola llamada.
 */

function header(payload: unknown, name: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const headers = (payload as { headers?: unknown }).headers
  if (!Array.isArray(headers)) return undefined
  const found = headers.find(
    (header) => typeof header === 'object' && header !== null && (header as { name?: string }).name?.toLowerCase() === name.toLowerCase(),
  )
  return found ? String((found as { value?: string }).value) : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** Normaliza un item crudo de Composio/Gmail a GmailMessageSummary. */
export function normalizeGmailMessage(raw: unknown): GmailMessageSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>

  const id = typeof item.id === 'string' ? item.id : typeof item.messageId === 'string' ? item.messageId : null
  if (!id) return null
  const threadId = typeof item.threadId === 'string' ? item.threadId : id

  const payloadRaw = item.payload
  const fromRaw = header(payloadRaw, 'From') ?? (typeof item.from === 'string' ? item.from : undefined)
  const toRaw = header(payloadRaw, 'To') ?? (Array.isArray(item.to) ? item.to.join(', ') : undefined)
  const ccRaw = header(payloadRaw, 'Cc') ?? (Array.isArray(item.cc) ? item.cc.join(', ') : undefined)
  const subject = header(payloadRaw, 'Subject') ?? (typeof item.subject === 'string' ? item.subject : null)

  const from = splitAddresses(fromRaw)[0] ?? { email: null, name: null }
  const to = toRaw ? splitAddresses(toRaw).map((addr) => addr.email) : []
  const cc = ccRaw ? splitAddresses(ccRaw).map((addr) => addr.email) : []

  const labels = asStringArray(item.labelIds ?? item.labels)
  const internalDate = item.internalDate ?? item.date
  const dateMs = typeof internalDate === 'string' || typeof internalDate === 'number' ? Number(internalDate) : null
  const dateIso =
    dateMs !== null && Number.isFinite(dateMs)
      ? new Date(dateMs < 10_000_000_000 ? dateMs * 1000 : dateMs).toISOString()
      : new Date().toISOString()

  return {
    id,
    threadId,
    snippet: typeof item.snippet === 'string' ? item.snippet : '',
    labels,
    date: dateIso,
    fromEmail: from.email,
    fromName: from.name,
    toEmails: to,
    ccEmails: cc,
    subject,
    outbound: labels.includes('SENT'),
  }
}

/** Trae los mensajes de los últimos 2 días (recibidos + enviados) de la conexión. */
export async function fetchRecentSummariesViaComposio(
  composio: Composio,
  options: { userId: string },
): Promise<GmailMessageSummary[]> {
  const result = await executeTool<{ data?: string; successful?: boolean }>(composio, {
    toolkit: 'gmail',
    slug: 'GMAIL_FETCH_EMAILS',
    userId: options.userId,
    args: {
      query: 'newer_than:2d',
      include_payload: true,
      max_results: 200,
      verbose: false,
    },
  })

  let parsed: unknown = {}
  try {
    parsed = JSON.parse(result?.data ?? '{}')
  } catch {
    parsed = {}
  }
  const container = parsed as { messages?: unknown[] }
  const rawMessages = Array.isArray(container.messages) ? container.messages : []

  return rawMessages
    .map((raw) => normalizeGmailMessage(raw))
    .filter((summary): summary is GmailMessageSummary => summary !== null)
}
