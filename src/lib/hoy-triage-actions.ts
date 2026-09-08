'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

type TriageResult = { ok: true; updated: number } | { ok: false; error: string }

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

/** "E": marca los leads como contactados hoy (último contacto = ahora). */
export async function markLeadsContactedTodayAction(leadIds: number[]): Promise<TriageResult> {
  const scoped = await scopedLeadIds(leadIds)
  if (scoped.error) return { ok: false, error: scoped.error }
  const context = await getWorkspaceContext()
  const now = new Date().toISOString()

  let updated = 0
  for (const id of scoped.ids) {
    try {
      await context.payload.update({
        collection: 'leads',
        id,
        overrideAccess: false,
        user: context.user,
        data: { lastContactedAt: now },
      })
      await context.payload.create({
        collection: 'activities',
        overrideAccess: false,
        user: context.user,
        data: {
          tenant: context.tenantId,
          type: 'nota',
          occurredAt: now,
          summary: 'Contactado desde el triage de Hoy',
          lead: id,
          performedBy: context.user.id,
        },
      })
      updated++
    } catch (err) {
      // Un lead que falla (borrado en carrera, etc.) no aborta el lote.
      context.payload.logger.error({ msg: 'triage: fallo marcando contacto', leadId: id, err })
    }
  }

  revalidatePath('/workspace/hoy')
  revalidatePath('/workspace/crm')
  return { ok: true, updated }
}

/** "S": pospone los leads N días (1, 3 o 7) vía fechaProximaLlamada. */
export async function snoozeLeadsAction(leadIds: number[], days: number): Promise<TriageResult> {
  const safeDays = [1, 3, 7].includes(days) ? days : 1
  const scoped = await scopedLeadIds(leadIds)
  if (scoped.error) return { ok: false, error: scoped.error }
  const context = await getWorkspaceContext()
  const until = new Date(Date.now() + safeDays * DAY_MS).toISOString()

  let updated = 0
  for (const id of scoped.ids) {
    try {
      await context.payload.update({
        collection: 'leads',
        id,
        overrideAccess: false,
        user: context.user,
        data: { fechaProximaLlamada: until },
      })
      updated++
    } catch (err) {
      context.payload.logger.error({ msg: 'triage: fallo posponiendo lead', leadId: id, err })
    }
  }

  revalidatePath('/workspace/hoy')
  return { ok: true, updated }
}
