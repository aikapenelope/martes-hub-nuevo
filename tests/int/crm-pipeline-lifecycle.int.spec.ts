import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getPayload, type Payload } from 'payload'
import configPromise from '@/payload.config'
import type { Tenant, User, Lead } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import {
  convertLeadInSituAction,
  addLeadActivityInSituAction,
} from '@/lib/crm-pipeline-actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
}))

describe('CRM 360 Pipeline Lifecycle & In-Situ Conversion', { timeout: 35000 }, () => {
  let payload: Payload
  let user: User
  let tenant1: Tenant
  let tenant2: Tenant

  beforeEach(async () => {
    payload = await getPayload({ config: configPromise })

    const userDoc = (await payload.find({ collection: 'users', limit: 1 })).docs[0]
    expect(userDoc).toBeDefined()
    user = userDoc

    const tenantDocs = (await payload.find({ collection: 'tenants', limit: 2 })).docs
    expect(tenantDocs.length).toBeGreaterThanOrEqual(1)
    tenant1 = tenantDocs[0]

    if (tenantDocs.length > 1) {
      tenant2 = tenantDocs[1]
    } else {
      tenant2 = await payload.create({
        collection: 'tenants',
        data: {
          name: 'Tenant CRM Secundario ' + Date.now(),
          slug: 'tenant-crm-sec-' + Date.now(),
        },
      })
    }

    // Default context mock: tenant1 activo con permisos de edición
    vi.mocked(getWorkspaceContext).mockResolvedValue({
      payload,
      user,
      tenantId: tenant1.id,
      canEdit: true,
      roles: ['admin'],
    } as unknown as Awaited<ReturnType<typeof getWorkspaceContext>>)
  })

  describe('convertLeadInSituAction', () => {
    it('convierte un prospecto a cliente in-situ heredando datos comerciales y timeline', async () => {
      const lead = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Empresa Test Conversion ' + Date.now(),
          companyName: 'Test Corp CRM',
          email: `lead-conv-${Date.now()}@test.com`,
          phone: `58412${Math.floor(1000000 + Math.random() * 9000000)}`,
          city: 'Caracas',
          status: 'nuevo',
          source: 'manual',
          commercialNotes: 'Reunión inicial acordada por WhatsApp',
          notes: 'Notas de prospección',
          tenant: tenant1.id,
        },
      })) as Lead

      const result = await convertLeadInSituAction(lead.id)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.clientId).toBeDefined()
      expect(typeof result.clientId).toBe('number')

      // Verificar que el cliente existe con los datos correctos
      const client = await payload.findByID({
        collection: 'clients',
        id: result.clientId,
        overrideAccess: true,
      })
      expect(client).toBeDefined()
      expect(client.name).toBe(lead.fullName)
      expect(client.companyName).toBe('Test Corp CRM')
      expect(client.phone).toBe(lead.phone)
      expect(client.email).toBe(lead.email)
      expect(client.city).toBe('Caracas')
      expect(client.stage).toBe('nuevo')
      expect(client.commercialNotes).toBe('Reunión inicial acordada por WhatsApp')

      // Verificar que el lead se actualizó a 'calificado' y se enlazó con convertedClient
      const updatedLead = await payload.findByID({
        collection: 'leads',
        id: lead.id,
        overrideAccess: true,
      })
      expect(updatedLead.status).toBe('calificado')
      const convertedClientId =
        typeof updatedLead.convertedClient === 'object' && updatedLead.convertedClient !== null
          ? updatedLead.convertedClient.id
          : updatedLead.convertedClient
      expect(convertedClientId).toBe(result.clientId)

      // Verificar que se crearon las actividades duales de trazabilidad
      const activities = await payload.find({
        collection: 'activities',
        where: {
          or: [
            { client: { equals: result.clientId } },
            { lead: { equals: lead.id } },
          ],
        },
        overrideAccess: true,
      })
      expect(activities.docs.length).toBeGreaterThanOrEqual(2)
      const leadActivity = activities.docs.find((a) => {
        const aLeadId = typeof a.lead === 'object' && a.lead !== null ? a.lead.id : a.lead
        return aLeadId === lead.id
      })
      const clientActivity = activities.docs.find((a) => {
        const aClientId = typeof a.client === 'object' && a.client !== null ? a.client.id : a.client
        return aClientId === result.clientId
      })
      expect(leadActivity).toBeDefined()
      expect(clientActivity).toBeDefined()
    })

    it('es idempotente si el lead ya había sido convertido previamente', async () => {
      const lead = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Idempotent Lead ' + Date.now(),
          status: 'contactado',
          source: 'manual',
          tenant: tenant1.id,
        },
      })) as Lead

      const res1 = await convertLeadInSituAction(lead.id)
      expect(res1.ok).toBe(true)
      if (!res1.ok) return

      const res2 = await convertLeadInSituAction(lead.id)
      expect(res2.ok).toBe(true)
      if (!res2.ok) return

      expect(res2.clientId).toBe(res1.clientId)
    })

    it('bloquea la conversión si el usuario no tiene permisos de edición (canEdit: false)', async () => {
      vi.mocked(getWorkspaceContext).mockResolvedValueOnce({
        payload,
        user,
        tenantId: tenant1.id,
        canEdit: false,
        roles: ['viewer'],
      } as unknown as Awaited<ReturnType<typeof getWorkspaceContext>>)

      const lead = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Viewer Lead ' + Date.now(),
          status: 'nuevo',
          source: 'manual',
          tenant: tenant1.id,
        },
      })) as Lead

      const result = await convertLeadInSituAction(lead.id)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('No tienes permiso para convertir prospectos')
      }
    })

    it('aislamiento multi-tenant: no permite convertir un lead de otro tenant', async () => {
      // Lead creado en tenant2
      const leadOtherTenant = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Lead Tenant 2 ' + Date.now(),
          status: 'nuevo',
          source: 'manual',
          tenant: tenant2.id,
        },
      })) as Lead

      // Intentar convertir mientras el contexto activo es tenant1
      const result = await convertLeadInSituAction(leadOtherTenant.id)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('Lead no encontrado en el tenant activo')
      }
    })
  })

  describe('addLeadActivityInSituAction', () => {
    it('registra una actividad en el timeline del lead in-situ con normalización de tipo', async () => {
      const lead = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Activity Lead ' + Date.now(),
          status: 'contactado',
          source: 'manual',
          tenant: tenant1.id,
        },
      })) as Lead

      // Registrar una llamada
      const res1 = await addLeadActivityInSituAction({
        leadId: lead.id,
        summary: 'Llamada de seguimiento exitosa',
        type: 'llamada',
      })
      expect(res1.ok).toBe(true)
      if (!res1.ok) return

      const activity1 = await payload.findByID({
        collection: 'activities',
        id: res1.activityId,
        overrideAccess: true,
      })
      expect(activity1.type).toBe('llamada')
      expect(activity1.summary).toBe('Llamada de seguimiento exitosa')

      // Registrar con tipo correo (se normaliza a email)
      const res2 = await addLeadActivityInSituAction({
        leadId: lead.id,
        summary: 'Cotización enviada por email',
        type: 'correo',
      })
      expect(res2.ok).toBe(true)
      if (!res2.ok) return

      const activity2 = await payload.findByID({
        collection: 'activities',
        id: res2.activityId,
        overrideAccess: true,
      })
      expect(activity2.type).toBe('email')
      expect(activity2.summary).toBe('Cotización enviada por email')
    })

    it('falla si el resumen de la actividad está vacío', async () => {
      const lead = (await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          fullName: 'Empty Activity Lead ' + Date.now(),
          status: 'nuevo',
          source: 'manual',
          tenant: tenant1.id,
        },
      })) as Lead

      const result = await addLeadActivityInSituAction({
        leadId: lead.id,
        summary: '   ',
        type: 'nota',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('no puede estar vacío')
      }
    })
  })
})
