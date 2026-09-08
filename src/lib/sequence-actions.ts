'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { safeInternalRedirect } from '@/lib/internal-redirect'
import { getScopedLead } from '@/lib/crm-scoped-entities'
import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Inscripción manual de un lead a una secuencia (decisión de producto
 * 2026-09-08: el agente decide; el job no auto-inscribe). Dedupe por índice
 * único parcial (tenant, sequence, lead) WHERE status='activa' + chequeo
 * previo para un error amigable en UI.
 */
export async function enrollLeadInSequenceAction(form: FormData): Promise<void> {
  const leadId = Number(form.get('leadId'))
  const sequenceId = Number(form.get('sequenceId'))
  const redirectTo = safeInternalRedirect(form.get('redirectTo'))
  if (!Number.isInteger(leadId) || leadId <= 0 || !Number.isInteger(sequenceId) || sequenceId <= 0) {
    redirectWithError(redirectTo, 'Parámetros de inscripción inválidos')
  }

  const context = await getWorkspaceContext()
  if (!context.canEdit) redirectWithError(redirectTo, 'No tienes permiso para inscribir leads')
  await getScopedLead(leadId) // valida pertenencia al tenant activo

  // La secuencia debe ser del tenant activo y estar activa.
  const seqRes = await context.payload.find({
    collection: 'sequences',
    limit: 1,
    depth: 0,
    where: {
      and: [
        { id: { equals: sequenceId } },
        { tenant: { equals: context.tenantId } },
        { active: { equals: true } },
      ],
    },
    overrideAccess: false,
    user: context.user,
  })
  const sequence = seqRes.docs[0]
  if (!sequence) redirectWithError(redirectTo, 'La secuencia no existe o está inactiva')

  // Dedupe amigable: una sola inscripción activa por (secuencia, lead).
  const dupRes = await context.payload.find({
    collection: 'sequence-enrollments',
    limit: 1,
    depth: 0,
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        { sequence: { equals: sequenceId } },
        { lead: { equals: leadId } },
        { status: { equals: 'activa' } },
      ],
    },
    overrideAccess: false,
    user: context.user,
  })
  if (dupRes.docs[0]) {
    redirectWithError(redirectTo, 'Este lead ya está inscrito en esa secuencia')
  }

  try {
    await context.payload.create({
      collection: 'sequence-enrollments',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        sequence: sequenceId,
        lead: leadId,
        status: 'activa',
        currentStep: 0,
        nextRunAt: new Date().toISOString(),
        enrolledBy: context.user.id,
      },
    })
  } catch (err) {
    // Carrera de dobles clics: el índice único parcial la resuelve.
    const pgCode = (err as { cause?: { code?: string } }).cause?.code
    if (pgCode !== '23505' && !(err instanceof Error && err.message.includes('duplicate key'))) {
      redirectWithError(redirectTo, 'No se pudo inscribir el lead')
    }
  }

  revalidatePath(redirectTo || '/workspace/crm')
  redirect(redirectTo || '/workspace/crm')
}

/** Cancela una inscripción activa del tenant (control del agente). */
export async function cancelSequenceEnrollmentAction(form: FormData): Promise<void> {
  const enrollmentId = Number(form.get('enrollmentId'))
  const redirectTo = safeInternalRedirect(form.get('redirectTo'))
  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
    redirectWithError(redirectTo, 'Inscripción inválida')
  }

  const context = await getWorkspaceContext()
  if (!context.canEdit) redirectWithError(redirectTo, 'No tienes permiso para cancelar inscripciones')

  // Validación de tenancy: la inscripción debe ser del tenant activo.
  const res = await context.payload.find({
    collection: 'sequence-enrollments',
    limit: 1,
    depth: 0,
    where: {
      and: [{ id: { equals: enrollmentId } }, { tenant: { equals: context.tenantId } }],
    },
    overrideAccess: false,
    user: context.user,
  })
  const enrollment = res.docs[0]
  if (!enrollment) redirectWithError(redirectTo, 'Inscripción no encontrada')
  if (enrollment.status !== 'activa') redirectWithError(redirectTo, 'La inscripción ya no está activa')

  await context.payload.update({
    collection: 'sequence-enrollments',
    id: enrollmentId,
    overrideAccess: false,
    user: context.user,
    data: { status: 'cancelada' },
  })

  revalidatePath(redirectTo || '/workspace/crm')
  redirect(redirectTo || '/workspace/crm')
}

function redirectWithError(redirectTo: string, message: string): never {
  const base = redirectTo // ya saneado por safeInternalRedirect
  const separator = base.includes('?') ? '&' : '?'
  redirect(`${base}${separator}sequenceError=${encodeURIComponent(message)}`)
}
