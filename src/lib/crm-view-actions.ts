'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { buildCrmHref } from '@/lib/crm-href'
import { parseCrmFilters, type CrmSearchParams } from '@/lib/crm-filters'
import type { SavedCrmViewLike } from '@/lib/crm-views'
import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Server actions de las vistas guardadas del CRM (ítem 4). Vistas PRIVADAS
 * por usuario: el upsert deduplica por (tenant, usuario, nombre) y el delete
 * valida owner. El redirect tras guardar SIEMPRE se construye en el server
 * desde los filtros normalizados — nunca desde un valor del cliente
 * (hallazgo Devin #104: sin redirects arbitrarios).
 */

function firstOf(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

/** Violación de constraint único de Postgres (23505 / mensaje pg). Mismo criterio que sequences.ts. */
function isUniqueViolation(err: unknown): boolean {
  const pgCode = (err as { cause?: { code?: string } })?.cause?.code
  return pgCode === '23505' || (err instanceof Error && err.message.includes('duplicate key'))
}

export async function createCrmSavedViewAction(form: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) redirect('/workspace/crm')

  const name = firstOf(form.get('name')).trim().slice(0, 60)
  if (!name) redirect('/workspace/crm')

  const params: CrmSearchParams = {
    vista: firstOf(form.get('vista')),
    modo: firstOf(form.get('modo')),
    q: firstOf(form.get('q')),
    estado: firstOf(form.get('estado')),
    fuente: firstOf(form.get('fuente')),
    agente: firstOf(form.get('agente')),
  }
  // Whitelists canónicas: lo guardado nunca excede lo que la URL acepta.
  const filters = parseCrmFilters(params)

  // Upsert por (tenant, usuario, nombre): guardar dos veces el mismo nombre
  // actualiza la vista en vez de duplicarla.
  const existing = await context.payload.find({
    collection: 'saved-crm-views',
    limit: 1,
    depth: 0,
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        { createdBy: { equals: context.user.id } },
        { name: { equals: name } },
      ],
    },
    overrideAccess: false,
    user: context.user,
  })

  const data = {
    tenant: context.tenantId,
    createdBy: context.user.id,
    name,
    vista: filters.view,
    modo: filters.mode,
    q: filters.query,
    estado: filters.view === 'leads' ? (filters.status === 'todos' ? '' : filters.status) : filters.stage === 'todos' ? '' : filters.stage,
    fuente: filters.source ?? '',
    agente: filters.agent ?? 'todos',
  }

  if (existing.docs[0]) {
    await context.payload.update({
      collection: 'saved-crm-views',
      id: existing.docs[0].id,
      overrideAccess: false,
      user: context.user,
      data,
    })
  } else {
    try {
      await context.payload.create({
        collection: 'saved-crm-views',
        overrideAccess: false,
        user: context.user,
        data,
      })
    } catch (err) {
      // Carrera de dobles envíos con el mismo nombre (hallazgo Devin #107-1):
      // dos creates concurrentes alcanzan el create y el índice único
      // (tenant, owner, name) rechaza a uno. Se completa el upsert: re-lectura
      // owner-scoped y update del registro ganador.
      if (!isUniqueViolation(err)) throw err
      const raced = await context.payload.find({
        collection: 'saved-crm-views',
        limit: 1,
        depth: 0,
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { createdBy: { equals: context.user.id } },
            { name: { equals: name } },
          ],
        },
        overrideAccess: false,
        user: context.user,
      })
      const winner = raced.docs[0]
      if (!winner) throw err
      await context.payload.update({
        collection: 'saved-crm-views',
        id: winner.id,
        overrideAccess: false,
        user: context.user,
        data,
      })
    }
  }

  revalidatePath('/workspace/crm')
  // Redirect construido en el server desde los filtros validados: la vista
  // queda aplicada tras guardar. Sin redirectTo del cliente (open redirect).
  redirect(buildCrmHref(filters, { page: undefined }))
}

export async function deleteCrmSavedViewAction(form: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) redirect('/workspace/crm')

  const id = Number(firstOf(form.get('viewId')))
  if (!Number.isInteger(id) || id <= 0) redirect('/workspace/crm')

  // Owner-scope: la vista debe ser del usuario del tenant activo.
  const res = await context.payload.find({
    collection: 'saved-crm-views',
    limit: 1,
    depth: 0,
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        { createdBy: { equals: context.user.id } },
        { id: { equals: id } },
      ],
    },
    overrideAccess: false,
    user: context.user,
  })
  const view: SavedCrmViewLike | undefined = res.docs[0]
  if (!view) redirect('/workspace/crm')

  await context.payload.delete({
    collection: 'saved-crm-views',
    id,
    overrideAccess: false,
    user: context.user,
  })

  revalidatePath('/workspace/crm')
  redirect('/workspace/crm?agente=me')
}
