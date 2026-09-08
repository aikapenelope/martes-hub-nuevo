'use server'

import { revalidatePath } from 'next/cache'
import type { PayloadRequest } from 'payload'

import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Resultado por ID (hallazgo Devin #105-1): la UI solo oculta los leads
 * CONFIRMADOS; los que fallaron siguen visibles y se reportan aparte.
 * `ok: false` implica que NADA se aplicó (error global o falló todo el lote).
 */
type TriageResult = {
  ok: boolean
  updated: number
  updatedIds: number[]
  failedIds: number[]
  error?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Acciones del triage estilo Linear en "Hoy" (ítem 3, sector operacional).
 * Solo leads (decisión de producto: los clientes no tienen campos de
 * contacto/snooze). "E = contactado" marca lastContactedAt y la cola deja de
 * mostrar al lead (la referencia pasa a ser el último contacto en cualquier
 * dirección); "S = posponer" fija fechaProximaLlamada a N días.
 */

async function scopedLeadIds(leadIds: number[]): Promise<{
  ids: number[]
  error?: string
}> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) return { ids: [], error: 'No tienes permiso para actualizar leads' }
  const clean = [...new Set(leadIds)].filter((id) => Number.isInteger(id) && id > 0)
  if (clean.length === 0) return { ids: [], error: 'Sin leads seleccionados' }

  // Validación de tenancy: solo se aceptan leads del tenant activo.
  const res = await context.payload.find({
    collection: 'leads',
    limit: clean.length,
    depth: 0,
    where: {
      and: [{ tenant: { equals: context.tenantId } }, { id: { in: clean } }],
    },
    overrideAccess: false,
    user: context.user,
  })
  return { ids: res.docs.map((doc) => doc.id) }
}

function emptyResult(): TriageResult {
  return { ok: true, updated: 0, updatedIds: [], failedIds: [] }
}

/** "E": marca los leads como contactados hoy (último contacto = ahora). */
export async function markLeadsContactedTodayAction(leadIds: number[]): Promise<TriageResult> {
  const scoped = await scopedLeadIds(leadIds)
  if (scoped.error) return { ...emptyResult(), ok: false, error: scoped.error }
  const context = await getWorkspaceContext()
  const now = new Date().toISOString()

  const result = emptyResult()
  for (const id of scoped.ids) {
    // Atomicidad por lead (hallazgo Devin #105-1): la escritura del lead y su
    // actividad de timeline se confirman juntas — mismo patrón de transacción
    // que markLeadContactedAction (outreach-actions). Un fallo a mitad hace
    // rollback de ambas y el lead queda en failedIds, no en ocultos.
    const transactionReq = {
      payload: context.payload,
      user: context.user,
    } as unknown as PayloadRequest
    const transactionID = await context.payload.db.beginTransaction()
    if (transactionID) transactionReq.transactionID = transactionID

    try {
      await context.payload.update({
        collection: 'leads',
        id,
        overrideAccess: false,
        user: context.user,
        req: transactionReq,
        data: { lastContactedAt: now },
      })
      await context.payload.create({
        collection: 'activities',
        overrideAccess: false,
        user: context.user,
        req: transactionReq,
        data: {
          tenant: context.tenantId,
          type: 'nota',
          occurredAt: now,
          summary: 'Contactado desde el triage de Hoy',
          lead: id,
          performedBy: context.user.id,
        },
      })
      if (transactionID) await context.payload.db.commitTransaction(transactionID)
      result.updatedIds.push(id)
    } catch (err) {
      if (transactionID) {
        try {
          await context.payload.db.rollbackTransaction(transactionID)
        } catch {
          // El rollback es best-effort: el error original es el relevante.
        }
      }
      // Un lead que falla (borrado en carrera, etc.) no aborta el lote.
      context.payload.logger.error({ msg: 'triage: fallo marcando contacto', leadId: id, err })
      result.failedIds.push(id)
    }
  }

  if (result.updatedIds.length === 0 && result.failedIds.length > 0) {
    return { ...result, ok: false, error: 'Ningún lead pudo actualizarse' }
  }

  result.updated = result.updatedIds.length
  revalidatePath('/workspace/hoy')
  revalidatePath('/workspace/crm')
  return result
}

/** "S": pospone los leads N días (1, 3 o 7) vía fechaProximaLlamada. */
export async function snoozeLeadsAction(leadIds: number[], days: number): Promise<TriageResult> {
  const safeDays = [1, 3, 7].includes(days) ? days : 1
  const scoped = await scopedLeadIds(leadIds)
  if (scoped.error) return { ...emptyResult(), ok: false, error: scoped.error }
  const context = await getWorkspaceContext()
  const until = new Date(Date.now() + safeDays * DAY_MS).toISOString()

  const result = emptyResult()
  for (const id of scoped.ids) {
    try {
      await context.payload.update({
        collection: 'leads',
        id,
        overrideAccess: false,
        user: context.user,
        data: { fechaProximaLlamada: until },
      })
      result.updatedIds.push(id)
    } catch (err) {
      context.payload.logger.error({ msg: 'triage: fallo posponiendo lead', leadId: id, err })
      result.failedIds.push(id)
    }
  }

  if (result.updatedIds.length === 0 && result.failedIds.length > 0) {
    return { ...result, ok: false, error: 'Ningún lead pudo posponerse' }
  }

  result.updated = result.updatedIds.length
  revalidatePath('/workspace/hoy')
  return result
}
