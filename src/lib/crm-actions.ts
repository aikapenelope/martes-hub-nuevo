'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { Activity } from '@/payload-types'
import { CLIENT_STAGES, LEAD_STATUSES, type ClientStage, type LeadStatus } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'

// Valores válidos del select Activity.type (deben coincidir con Collections/Activities.ts)
const ACTIVITY_TYPES: Activity['type'][] = ['nota', 'llamada', 'whatsapp', 'email', 'reunion', 'otro']

const MAX_NAME = 160
const MAX_CONTACT = 240
const MAX_NOTES = 4000

function requiredText(formData: FormData, key: string, max = MAX_NAME): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalText(formData: FormData, key: string, max = MAX_CONTACT): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().slice(0, max)
}

function numericId(formData: FormData, key: string): number {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) throw new Error('Identificador inválido')
  return value
}

function assertEditor(canEdit: boolean): void {
  if (!canEdit) throw new Error('No tienes permiso para modificar el CRM')
}

import { getScopedClient, getScopedLead } from '@/lib/crm-scoped-entities'

const scopedLead = getScopedLead
const scopedClient = getScopedClient

export async function createLeadAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const rawStatus = optionalText(formData, 'status', 30) ?? 'nuevo'
  const status: LeadStatus = LEAD_STATUSES.includes(rawStatus as LeadStatus) ? (rawStatus as LeadStatus) : 'nuevo'

  const lead = await context.payload.create({
    collection: 'leads',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      fullName: requiredText(formData, 'fullName'),
      status,
      source: 'manual',
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  await context.payload.create({
    collection: 'activities',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      type: 'nota',
      occurredAt: new Date().toISOString(),
      summary: 'Lead creado desde el workspace',
      lead: lead.id,
      performedBy: context.user.id,
    },
  })

  revalidatePath('/workspace/crm')
  redirect(`/workspace/crm/leads/${lead.id}?created=1`)
}

export async function updateLeadAction(formData: FormData): Promise<void> {
  const id = numericId(formData, 'id')
  const { context } = await scopedLead(id)
  assertEditor(context.canEdit)

  const rawStatus = requiredText(formData, 'status', 30)
  if (!LEAD_STATUSES.includes(rawStatus as LeadStatus)) throw new Error('Estado de lead inválido')

  await context.payload.update({
    collection: 'leads',
    id,
    overrideAccess: false,
    user: context.user,
    data: {
      fullName: requiredText(formData, 'fullName'),
      status: rawStatus as LeadStatus,
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace/crm')
  revalidatePath(`/workspace/crm/leads/${id}`)
  redirect(`/workspace/crm/leads/${id}?updated=1`)
}

export async function createClientAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const rawStage = optionalText(formData, 'stage', 30) ?? 'nuevo'
  const stage: ClientStage = CLIENT_STAGES.includes(rawStage as ClientStage) ? (rawStage as ClientStage) : 'nuevo'

  const client = await context.payload.create({
    collection: 'clients',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: requiredText(formData, 'name'),
      stage,
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      consent: formData.get('consent') === 'on',
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  await context.payload.create({
    collection: 'activities',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      type: 'nota',
      occurredAt: new Date().toISOString(),
      summary: 'Cliente creado desde el workspace',
      client: client.id,
      performedBy: context.user.id,
    },
  })

  revalidatePath('/workspace/crm')
  redirect(`/workspace/crm/clientes/${client.id}?created=1`)
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const id = numericId(formData, 'id')
  const { context } = await scopedClient(id)
  assertEditor(context.canEdit)

  const rawStage = requiredText(formData, 'stage', 30)
  if (!CLIENT_STAGES.includes(rawStage as ClientStage)) throw new Error('Etapa de cliente inválida')

  await context.payload.update({
    collection: 'clients',
    id,
    overrideAccess: false,
    user: context.user,
    data: {
      name: requiredText(formData, 'name'),
      stage: rawStage as ClientStage,
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      consent: formData.get('consent') === 'on',
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace/crm')
  revalidatePath(`/workspace/crm/clientes/${id}`)
  redirect(`/workspace/crm/clientes/${id}?updated=1`)
}

/**
 * Conversión idempotente: si el lead ya fue convertido, reutiliza el cliente.
 * El lead se marca calificado y queda enlazado al nuevo cliente.
 */
export async function convertLeadAction(formData: FormData): Promise<void> {
  const id = numericId(formData, 'id')
  const { lead, context } = await scopedLead(id)
  assertEditor(context.canEdit)

  const existingClientId =
    typeof lead.convertedClient === 'number' ? lead.convertedClient : lead.convertedClient?.id

  if (existingClientId) redirect(`/workspace/crm/clientes/${existingClientId}?converted=already`)

  const client = await context.payload.create({
    collection: 'clients',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: lead.fullName,
      stage: 'nuevo',
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
      segment: typeof lead.segment === 'number' ? lead.segment : lead.segment?.id,
      notes: lead.notes ?? undefined,
    },
  })

  await context.payload.update({
    collection: 'leads',
    id,
    overrideAccess: false,
    user: context.user,
    data: { status: 'calificado', convertedClient: client.id },
  })

  await Promise.all([
    context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        type: 'nota',
        occurredAt: new Date().toISOString(),
        summary: `Convertido desde lead #${lead.id}`,
        client: client.id,
        performedBy: context.user.id,
      },
    }),
    context.payload.create({
      collection: 'activities',
      overrideAccess: false,
      user: context.user,
      data: {
        tenant: context.tenantId,
        type: 'nota',
        occurredAt: new Date().toISOString(),
        summary: `Convertido al cliente #${client.id}`,
        lead: lead.id,
        performedBy: context.user.id,
      },
    }),
  ])

  revalidatePath('/workspace/crm')
  revalidatePath(`/workspace/crm/leads/${id}`)
  redirect(`/workspace/crm/clientes/${client.id}?converted=1`)
}

/**
 * Registra una actividad (nota, llamada, reunión…) en la ficha de un lead o cliente.
 *
 * Patrón: mismo que createLeadAction — Server Action con overrideAccess: false + user
 * (QUERIES.md > Access Control in Local API).
 * performedBy se auto-asigna en el beforeChange hook de Activities; no se pasa aquí.
 */
export async function createActivityAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const rawType = optionalText(formData, 'type', 30) ?? 'nota'
  const type: Activity['type'] = ACTIVITY_TYPES.includes(rawType as Activity['type'])
    ? (rawType as Activity['type'])
    : 'nota'

  const summary = requiredText(formData, 'summary', 500)
  const occurredAt = optionalText(formData, 'occurredAt', 40) ?? new Date().toISOString()

  // client y lead son opcionales pero uno debe estar presente — la colección lo valida
  const clientRaw = formData.get('client')
  const leadRaw = formData.get('lead')
  const clientId = clientRaw ? Number(clientRaw) : undefined
  const leadId = leadRaw ? Number(leadRaw) : undefined

  // Verificar que client/lead pertenecen al tenant activo (no se puede inyectar IDs ajenos)
  if (clientId && Number.isInteger(clientId) && clientId > 0) {
    const { client } = await scopedClient(clientId)
    void client // verificación implícita — lanza si no pertenece al tenant
  }
  if (leadId && Number.isInteger(leadId) && leadId > 0) {
    const { lead } = await scopedLead(leadId)
    void lead
  }

  await context.payload.create({
    collection: 'activities',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      type,
      summary,
      occurredAt,
      ...(clientId && Number.isInteger(clientId) ? { client: clientId } : {}),
      ...(leadId && Number.isInteger(leadId) ? { lead: leadId } : {}),
    },
  })

  // Revalidar la ficha del registro afectado
  if (clientId) revalidatePath(`/workspace/crm/clientes/${clientId}`)
  if (leadId) revalidatePath(`/workspace/crm/leads/${leadId}`)
  revalidatePath('/workspace')
}
