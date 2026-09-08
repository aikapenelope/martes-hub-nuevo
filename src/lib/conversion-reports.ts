import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { findAllPages } from '@/lib/lead-scoring'

/**
 * Reportes de conversión (ítem 5, sector operacional): embudo
 * entrada → contactado → calificado → cliente desglosado por origen y por
 * agente. Agregación pesada con GROUP BY en Postgres vía pool (convención
 * del repo, patrón db-aggregates) y fallback paginado RLS con la Local API.
 *
 * Semántica del embudo: los leads no guardan historial de etapas, así que
 * "alcanzó la etapa" se infiere del estado actual — contactado = estado en
 * ('contactado','calificado') o convertido; calificado = estado 'calificado'
 * o convertido; cliente = tiene converted_client. Un lead descartado cuenta
 * solo como entrada (limitación conocida, documentada en el PR).
 */

const STAGE_REACHED_CONTACT = ['contactado', 'calificado']

export interface ConversionReportRow {
  key: string
  label: string
  entrada: number
  contactado: number
  calificado: number
  cliente: number
  descartado: number
  /** % de leads que llegaron a cliente (cliente/entrada). */
  conversionPct: number
}

export interface ConversionLeadRow {
  source?: string | null
  status?: string | null
  converted?: boolean
  assignedTo?: number | null
}

export interface ConversionReport {
  bySource: ConversionReportRow[]
  byAgent: ConversionReportRow[]
}

/** Etiquetas de origen — misma lista que el select del CRM (crm-filters). */
export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  google_maps: 'Google Maps / Local',
  puerta_fria: 'Puerta Fría / En Persona',
  llamada_fria: 'Llamada Fría',
  whatsapp: 'WhatsApp Directo',
  instagram_dm: 'Instagram DM',
  linkedin: 'LinkedIn',
  tally: 'Formulario Web / Tally',
  apify: 'Apify Scraper',
  referido: 'Referido',
}

function conversionPct(cliente: number, entrada: number): number {
  return entrada > 0 ? Math.round((cliente / entrada) * 100) : 0
}

/**
 * Agregador puro (testeable): acumula filas de leads en filas de embudo por
 * clave. Usado por el fallback de la Local API y como referencia exacta del
 * SQL (FILTER (WHERE ...) equivalente).
 */
export function aggregateConversionRows(
  leads: ConversionLeadRow[],
  keyOf: (lead: ConversionLeadRow) => string,
  labelOf: (key: string) => string,
): ConversionReportRow[] {
  const byKey = new Map<string, ConversionReportRow>()
  for (const lead of leads) {
    const key = keyOf(lead)
    let row = byKey.get(key)
    if (!row) {
      row = { key, label: labelOf(key), entrada: 0, contactado: 0, calificado: 0, cliente: 0, descartado: 0, conversionPct: 0 }
      byKey.set(key, row)
    }
    const status = lead.status ?? ''
    const converted = Boolean(lead.converted)
    row.entrada++
    if (converted || STAGE_REACHED_CONTACT.includes(status)) row.contactado++
    if (converted || status === 'calificado') row.calificado++
    if (converted) row.cliente++
    if (status === 'descartado') row.descartado++
  }
  const rows = Array.from(byKey.values()).map((row) => ({
    ...row,
    conversionPct: conversionPct(row.cliente, row.entrada),
  }))
  rows.sort((a, b) => b.entrada - a.entrada)
  return rows
}

type Pool = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

interface RawGroupRow {
  grp: string | null
  entrada: string | number
  contactado: string | number
  calificado: string | number
  cliente: string | number
  descartado: string | number
}

const SQL_GROUP_BY = (groupExpr: string): string => `
  SELECT ${groupExpr} AS grp,
    COUNT(*) AS entrada,
    COUNT(*) FILTER (WHERE status::text = ANY($2::text[]) OR converted_client_id IS NOT NULL) AS contactado,
    COUNT(*) FILTER (WHERE status::text = 'calificado' OR converted_client_id IS NOT NULL) AS calificado,
    COUNT(*) FILTER (WHERE converted_client_id IS NOT NULL) AS cliente,
    COUNT(*) FILTER (WHERE status::text = 'descartado') AS descartado
  FROM leads
  WHERE tenant_id = $1
  GROUP BY 1
  ORDER BY entrada DESC`

function rowsFromSql(raw: RawGroupRow[], labelOf: (key: string) => string): ConversionReportRow[] {
  return raw.map((r) => {
    const entrada = Number(r.entrada)
    const cliente = Number(r.cliente)
    return {
      key: r.grp ?? 'sin_asignar',
      label: labelOf(r.grp ?? 'sin_asignar'),
      entrada,
      contactado: Number(r.contactado),
      calificado: Number(r.calificado),
      cliente,
      descartado: Number(r.descartado),
      conversionPct: conversionPct(cliente, entrada),
    }
  })
}

/**
 * Reporte completo del tenant: por origen y por agente. Nombres de agente
 * resueltos con la colección users del tenant (fallback 'Agente #id).
 */
export async function getConversionReport({
  payload,
  user,
  tenantId,
}: {
  payload: Payload
  user: User
  tenantId: number
}): Promise<ConversionReport> {
  const db = payload.db as { pool?: Pool }

  // Nombres de agentes para el desglose (una sola consulta chiquita).
  const users = await findAllPages((page) =>
    payload.find({
      collection: 'users',
      where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
      limit: 200,
      page,
      depth: 0,
      select: { firstName: true, lastName: true, email: true },
      overrideAccess: true,
    }),
  )
  const agentNames = new Map<number, string>(
    users.map((u) => [
      u.id,
      `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
    ]),
  )

  let bySource: ConversionReportRow[] = []
  let byAgent: ConversionReportRow[] = []

  if (db.pool && typeof db.pool.query === 'function') {
    try {
      const [sourceRes, agentRes] = await Promise.all([
        db.pool.query(SQL_GROUP_BY(`COALESCE(source, 'manual')`), [tenantId, STAGE_REACHED_CONTACT]),
        db.pool.query(SQL_GROUP_BY(`COALESCE(assigned_to::text, 'sin_asignar')`), [tenantId, STAGE_REACHED_CONTACT]),
      ])
      bySource = rowsFromSql(sourceRes.rows as unknown as RawGroupRow[], (key) => SOURCE_LABELS[key] ?? key)
      byAgent = rowsFromSql(agentRes.rows as unknown as RawGroupRow[], (key) => {
        const id = Number(key)
        return Number.isInteger(id) ? (agentNames.get(id) ?? `Agente #${id}`) : 'Sin asignar'
      })
      return { bySource, byAgent }
    } catch {
      // SQL no disponible o con error → fallback RLS paginado abajo.
    }
  }

  // Fallback Local API: paginado completo con user + overrideAccess:false.
  const leadRows = await findAllPages((page) =>
    payload.find({
      collection: 'leads',
      where: { tenant: { equals: tenantId } },
      limit: 500,
      page,
      depth: 0,
      select: { source: true, status: true, convertedClient: true, assignedTo: true },
      overrideAccess: false,
      user,
    }),
  )
  const leads: ConversionLeadRow[] = leadRows.map((lead) => ({
    source: lead.source,
    status: lead.status,
    converted: Boolean(lead.convertedClient),
    assignedTo: typeof lead.assignedTo === 'object' ? (lead.assignedTo?.id ?? null) : (lead.assignedTo ?? null),
  }))
  bySource = aggregateConversionRows(
    leads,
    (lead) => lead.source ?? 'manual',
    (key) => SOURCE_LABELS[key] ?? key,
  )
  byAgent = aggregateConversionRows(
    leads,
    (lead) => (lead.assignedTo != null ? String(lead.assignedTo) : 'sin_asignar'),
    (key) => {
      const id = Number(key)
      return Number.isInteger(id) ? (agentNames.get(id) ?? `Agente #${id}`) : 'Sin asignar'
    },
  )
  return { bySource, byAgent }
}
