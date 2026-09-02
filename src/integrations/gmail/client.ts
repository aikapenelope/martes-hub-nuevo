/**
 * Cliente Gmail de SOLO LECTURA (Fase B).
 *
 * El correo no se envía desde aquí (eso sigue siendo Resend): este módulo
 * sustrae la data del buzón (recibidos y enviados) y la mete en el CRM en
 * `email-messages` vía el job `sync-email`. Autenticación OAuth2 offline con
 * refresh token compartido (src/integrations/google/token.ts) — mismo
 * client/secret de Google que ya usa el calendario.
 *
 * Sin dependencias nuevas: REST directo con fetch (Gmail API v1).
 *
 * Scopes mínimos: gmail.readonly.
 */

import { areGoogleCredentialsConfigured, getGoogleAccessToken } from '../google/token'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export function isGmailSyncConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_SYNC_ENABLED === 'true' &&
      areGoogleCredentialsConfigured() &&
      process.env.GMAIL_USER,
  )
}

export interface GmailMessageRef {
  id: string
  threadId: string
}

export interface GmailMessageSummary {
  id: string
  threadId: string
  snippet: string
  labels: string[]
  /** Epoch ms del mensaje (internalDate). */
  date: string
  fromEmail: string | null
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]
  subject: string | null
  /** true si el mensaje salió de este buzón (label SENT). */
  outbound: boolean
}

interface GmailHeader {
  name: string
  value: string
}

export function splitAddresses(raw: string | undefined | null): { email: string; name: string | null }[] {
  if (!raw) return []
  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let inAngle = false
  let escaped = false

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (char === '<' && !inQuotes) {
      inAngle = true
      current += char
      continue
    }
    if (char === '>' && !inQuotes) {
      inAngle = false
      current += char
      continue
    }
    if (char === ',' && !inQuotes && !inAngle) {
      if (current.trim()) tokens.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) {
    tokens.push(current.trim())
  }

  const results: { email: string; name: string | null }[] = []
  for (const token of tokens) {
    const angleMatch = token.match(/^(.*?)\s*<([^>]+)>\s*$/)
    if (angleMatch) {
      let name = angleMatch[1].trim()
      if (name.startsWith('"') && name.endsWith('"')) {
        name = name.slice(1, -1).replace(/\\"/g, '"').trim()
      }
      const email = angleMatch[2].trim().toLowerCase()
      if (email.includes('@')) {
        results.push({ name: name || null, email })
      }
    } else {
      let clean = token.trim()
      if (clean.startsWith('"') && clean.endsWith('"')) {
        clean = clean.slice(1, -1).trim()
      }
      if (clean.includes('@')) {
        results.push({ name: null, email: clean.toLowerCase() })
      }
    }
  }

  return results
}

export async function listRecentMessages(options: {
  query?: string
  maxResults?: number
} = {}): Promise<GmailMessageRef[]> {
  const token = await getGoogleAccessToken()
  const messages: GmailMessageRef[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      maxResults: String(Math.min(options.maxResults ?? 100, 500)),
    })
    if (options.query) params.set('q', options.query)
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Gmail list falló (${res.status}): ${(await res.text()).slice(0, 300)}`)

    const data = (await res.json()) as { messages?: GmailMessageRef[]; nextPageToken?: string }
    if (data.messages?.length) {
      messages.push(...data.messages)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return messages
}

export async function getMessage(id: string): Promise<GmailMessageSummary> {
  const token = await getGoogleAccessToken()
  const params = new URLSearchParams({ format: 'metadata' })
  for (const name of ['From', 'To', 'Cc', 'Subject', 'Date']) {
    params.append('metadataHeaders', name)
  }

  const res = await fetch(`${GMAIL_API}/messages/${encodeURIComponent(id)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail get(${id}) falló (${res.status}): ${(await res.text()).slice(0, 300)}`)

  const msg = (await res.json()) as {
    id: string
    threadId: string
    snippet?: string
    internalDate?: string
    labelIds?: string[]
    payload?: { headers?: GmailHeader[] }
  }

  const header = (name: string): string | undefined =>
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

  const from = splitAddresses(header('From'))[0] ?? null
  const to = splitAddresses(header('To'))
  const cc = splitAddresses(header('Cc'))
  const labels = msg.labelIds ?? []

  return {
    id: msg.id,
    threadId: msg.threadId,
    snippet: msg.snippet ?? '',
    labels,
    date: msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString(),
    fromEmail: from?.email ?? null,
    fromName: from?.name ?? null,
    toEmails: to.map((a) => a.email),
    ccEmails: cc.map((a) => a.email),
    subject: header('Subject') ?? null,
    outbound: labels.includes('SENT'),
  }
}
