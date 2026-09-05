'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { Payload } from 'payload'

import type { Activity } from '@/payload-types'
import { CLIENT_STAGES, LEAD_STATUSES, type ClientStage, type LeadStatus } from '@/lib/crm-data'
import { LEAD_SOURCES, type LeadSource } from '@/lib/crm-filters'
import { wholeUsd } from '@/lib/money'
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

function optionalNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key)
  if (!value || typeof value !== 'string' || !value.trim()) return null
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function numericId(formData: FormData, key: string): number {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) throw new Error('Identificador inválido')
  return value
}

function assertEditor(canEdit: boolean): void {
  if (!canEdit) throw new Error('No tienes permiso para modificar el CRM')
}

async function validateTenantSegment(
  payload: Payload,
  segmentId: number | null,
  tenantId: number,
): Promise<number | null> {
  if (!segmentId) return null
  const res = await payload.find({
    collection: 'segments',
    where: { and: [{ id: { equals: segmentId } }, { tenant: { equals: tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs.length === 0) {
    throw new Error('El segmento seleccionado no pertenece a este tenant.')
  }
  return segmentId
}

async function validateTenantCompany(
  payload: Payload,
  companyId: number | null,
  tenantId: number,
): Promise<number | null> {
  if (!companyId) return null
  const res = await payload.find({
    collection: 'companies',
    where: { and: [{ id: { equals: companyId } }, { tenant: { equals: tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs.length === 0) {
    throw new Error('La empresa seleccionada no pertenece a este tenant.')
  }
  return companyId
}

async function validateTenantAgent(
  payload: Payload,
  agentId: number | null,
  tenantId: number,
): Promise<number | null> {
  if (!agentId) return null
  const res = await payload.find({
    collection: 'users',
    where: {
      and: [
        { id: { equals: agentId } },
        { active: { equals: true } },
        { or: [{ 'tenants.tenant': { equals: tenantId } }, { roles: { contains: 'admin' } }] },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs.length === 0) {
    throw new Error('El agente asignado no pertenece a este tenant.')
  }
  return agentId
}

import { getScopedClient, getScopedCompany, getScopedLead } from '@/lib/crm-scoped-entities'

const scopedLead = getScopedLead
const scopedClient = getScopedClient
const scopedCompany = getScopedCompany

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

  const companyId = optionalNumber(formData, 'company')
  const segmentId = optionalNumber(formData, 'segment')
  const assignedToId = optionalNumber(formData, 'assignedTo')
  // Contrato entero (sin centavos): se normaliza con wholeUsd y null solo
  // si el campo viene vacío o la entrada no es numérica (limpia el valor).
  const estimatedValue = wholeUsd(formData.get('estimatedValue'))
  const rawSource = optionalText(formData, 'source', 50)
  const source: LeadSource | undefined =
    rawSource && LEAD_SOURCES.includes(rawSource as LeadSource)
      ? (rawSource as LeadSource)
      : undefined

  const [validCompanyId, validSegmentId, validAssignedToId] = await Promise.all([
    validateTenantCompany(context.payload, companyId, context.tenantId),
    validateTenantSegment(context.payload, segmentId, context.tenantId),
    validateTenantAgent(context.payload, assignedToId, context.tenantId),
  ])

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
      company: validCompanyId,
      companyName: optionalText(formData, 'companyName'),
      position: optionalText(formData, 'position'),
      city: optionalText(formData, 'city'),
      address: optionalText(formData, 'address'),
      googleMapsUrl: optionalText(formData, 'googleMapsUrl'),
      socialHandle: optionalText(formData, 'socialHandle'),
      source,
      segment: validSegmentId,
      assignedTo: validAssignedToId,
      estimatedValue: estimatedValue ?? null,
      commercialNotes: optionalText(formData, 'commercialNotes', MAX_NOTES),
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

  const companyId = optionalNumber(formData, 'company')
  const segmentId = optionalNumber(formData, 'segment')
  const assignedAgentId = optionalNumber(formData, 'assignedAgent')

  const [validCompanyId, validSegmentId, validAssignedAgentId] = await Promise.all([
    validateTenantCompany(context.payload, companyId, context.tenantId),
    validateTenantSegment(context.payload, segmentId, context.tenantId),
    validateTenantAgent(context.payload, assignedAgentId, context.tenantId),
  ])

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
      company: validCompanyId,
      companyName: optionalText(formData, 'companyName'),
      segment: validSegmentId,
      assignedAgent: validAssignedAgentId,
      city: optionalText(formData, 'city'),
      address: optionalText(formData, 'address'),
      consent: formData.get('consent') === 'on',
      commercialNotes: optionalText(formData, 'commercialNotes', MAX_NOTES),
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace/crm')
  revalidatePath(`/workspace/crm/clientes/${id}`)
  redirect(`/workspace/crm/clientes/${id}?updated=1`)
}

export async function createCompanyAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const segmentId = optionalNumber(formData, 'segment')
  const assignedAgentId = optionalNumber(formData, 'assignedAgent')

  const [validSegmentId, validAssignedAgentId] = await Promise.all([
    validateTenantSegment(context.payload, segmentId, context.tenantId),
    validateTenantAgent(context.payload, assignedAgentId, context.tenantId),
  ])

  const company = await context.payload.create({
    collection: 'companies',
    overrideAccess: false,
    user: context.user,
    data: {
      tenant: context.tenantId,
      name: requiredText(formData, 'name'),
      taxId: optionalText(formData, 'taxId', 50),
      website: optionalText(formData, 'website', 255),
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      city: optionalText(formData, 'city', 100),
      state: optionalText(formData, 'state', 100),
      address: optionalText(formData, 'address', 255),
      googleMapsUrl: optionalText(formData, 'googleMapsUrl', 500),
      socialHandle: optionalText(formData, 'socialHandle', 100),
      segment: validSegmentId,
      assignedAgent: validAssignedAgentId,
      commercialNotes: optionalText(formData, 'commercialNotes', MAX_NOTES),
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace/crm')
  redirect(`/workspace/crm/empresas/${company.id}?created=1`)
}

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const id = numericId(formData, 'id')
  const { context } = await scopedCompany(id)
  assertEditor(context.canEdit)

  const segmentId = optionalNumber(formData, 'segment')
  const assignedAgentId = optionalNumber(formData, 'assignedAgent')

  const [validSegmentId, validAssignedAgentId] = await Promise.all([
    validateTenantSegment(context.payload, segmentId, context.tenantId),
    validateTenantAgent(context.payload, assignedAgentId, context.tenantId),
  ])

  await context.payload.update({
    collection: 'companies',
    id,
    overrideAccess: false,
    user: context.user,
    data: {
      name: requiredText(formData, 'name'),
      taxId: optionalText(formData, 'taxId', 50),
      website: optionalText(formData, 'website', 255),
      email: optionalText(formData, 'email'),
      phone: optionalText(formData, 'phone'),
      city: optionalText(formData, 'city', 100),
      state: optionalText(formData, 'state', 100),
      address: optionalText(formData, 'address', 255),
      googleMapsUrl: optionalText(formData, 'googleMapsUrl', 500),
      socialHandle: optionalText(formData, 'socialHandle', 100),
      segment: validSegmentId,
      assignedAgent: validAssignedAgentId,
      commercialNotes: optionalText(formData, 'commercialNotes', MAX_NOTES),
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace/crm')
  revalidatePath(`/workspace/crm/empresas/${id}`)
  redirect(`/workspace/crm/empresas/${id}?updated=1`)
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
      company: typeof lead.company === 'number' ? lead.company : lead.company?.id,
      companyName: lead.companyName ?? undefined,
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
