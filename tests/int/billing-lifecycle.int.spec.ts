import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getPayload, type Payload } from 'payload'
import configPromise from '@/payload.config'
import type { Client, Tenant, User } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import {
  convertQuoteToInvoiceAction,
  updateInvoiceStatusAction,
  updatePaymentStatusAction,
  updateQuoteStatusAction,
} from '@/lib/billing-actions'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
}))

describe('Ciclo Comercial y Facturación In-Situ (Billing Lifecycle)', { timeout: 30000 }, () => {
  let payload: Payload
  let user: User
  let tenant1: Tenant
  let tenant2: Tenant
  let client1: Client
  let client2: Client

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
          name: 'Tenant Secundario Test ' + Date.now(),
          slug: 'tenant-test-' + Date.now(),
        },
      })
    }

    // Asegurar que existe un cliente para tenant1
    const existingClients = await payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenant1.id } },
      limit: 1,
    })

    if (existingClients.docs.length > 0) {
      client1 = existingClients.docs[0]
    } else {
      client1 = await payload.create({
        collection: 'clients',
        data: {
          name: 'Empresa Test ' + Date.now(),
          email: 'test@empresa.com',
          tenant: tenant1.id,
          stage: 'activo',
        },
      })
    }

    // Asegurar que existe un cliente para tenant2
    const existingClients2 = await payload.find({
      collection: 'clients',
      where: { tenant: { equals: tenant2.id } },
      limit: 1,
    })

    if (existingClients2.docs.length > 0) {
      client2 = existingClients2.docs[0]
    } else {
      client2 = await payload.create({
        collection: 'clients',
        data: {
          name: 'Empresa Test 2 ' + Date.now(),
          email: 'test2@empresa.com',
          tenant: tenant2.id,
          stage: 'activo',
        },
      })
    }

    // Default context mock: tenant1 activo con permisos de edición
    vi.mocked(getWorkspaceContext).mockResolvedValue({
      payload,
      user,
      tenant: tenant1,
      tenantId: tenant1.id,
      roles: ['admin'],
      canEdit: true,
      isAdmin: true,
    })
  })

  describe('updatePaymentStatusAction', () => {
    it('actualiza el cobro a pagado registrando fecha y método de pago', async () => {
      const payment = await payload.create({
        collection: 'payments',
        data: {
          client: client1.id,
          amount: 250,
          concept: 'Consultoría Estratégica E2E',
          dueDate: new Date().toISOString(),
          status: 'pendiente',
          tenant: tenant1.id,
        },
      })

      const res = await updatePaymentStatusAction({
        paymentId: payment.id,
        status: 'pagado',
        method: 'zelle',
        notes: 'Confirmado por transferencia Zelle ref #987654',
      })

      expect(res.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'payments',
        id: payment.id,
      })

      expect(updated.status).toBe('pagado')
      expect(updated.method).toBe('zelle')
      expect(updated.paidAt).toBeDefined()
      expect(updated.notes).toContain('Confirmado por transferencia Zelle ref #987654')
    })

    it('limpia paidAt al reactivar un cobro pagado a pendiente', async () => {
      const payment = await payload.create({
        collection: 'payments',
        data: {
          client: client1.id,
          amount: 120,
          concept: 'Servicio Web',
          dueDate: new Date().toISOString(),
          paidAt: new Date().toISOString(),
          status: 'pagado',
          method: 'pago_movil',
          tenant: tenant1.id,
        },
      })

      const res = await updatePaymentStatusAction({
        paymentId: payment.id,
        status: 'pendiente',
      })

      expect(res.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'payments',
        id: payment.id,
      })

      expect(updated.status).toBe('pendiente')
      expect(updated.paidAt).toBeNull()
    })

    it('bloquea la actualización si el cobro pertenece a otro tenant', async () => {
      // Cobro en tenant2 con cliente de tenant2
      const foreignPayment = await payload.create({
        collection: 'payments',
        data: {
          client: client2.id,
          amount: 500,
          concept: 'Cobro de otra empresa',
          dueDate: new Date().toISOString(),
          status: 'pendiente',
          tenant: tenant2.id,
        },
      })

      // Usuario opera en contexto de tenant1
      vi.mocked(getWorkspaceContext).mockResolvedValueOnce({
        payload,
        user,
        tenant: tenant1,
        tenantId: tenant1.id,
        roles: ['admin'],
        canEdit: true,
        isAdmin: true,
      })

      const res = await updatePaymentStatusAction({
        paymentId: foreignPayment.id,
        status: 'anulado',
      })

      expect(res.ok).toBe(false)
      expect(res.error).toContain('Cobro no encontrado o sin permisos en este tenant')

      // Verificar que sigue intacto
      const check = await payload.findByID({
        collection: 'payments',
        id: foreignPayment.id,
      })
      expect(check.status).toBe('pendiente')
    })

    it('bloquea la acción si el usuario no tiene permisos de edición (canEdit: false)', async () => {
      const payment = await payload.create({
        collection: 'payments',
        data: {
          client: client1.id,
          amount: 80,
          concept: 'Suscripción Básica',
          dueDate: new Date().toISOString(),
          status: 'pendiente',
          tenant: tenant1.id,
        },
      })

      vi.mocked(getWorkspaceContext).mockResolvedValueOnce({
        payload,
        user,
        tenant: tenant1,
        tenantId: tenant1.id,
        roles: ['viewer'],
        canEdit: false,
        isAdmin: false,
      })

      const res = await updatePaymentStatusAction({
        paymentId: payment.id,
        status: 'anulado',
      })

      expect(res.ok).toBe(false)
      expect(res.error).toContain('No tienes permiso')
    })
  })

  describe('convertQuoteToInvoiceAction', () => {
    it('convierte cotización en factura comercial, vincula sourceQuote y crea el cobro pendiente', async () => {
      const quote = await payload.create({
        collection: 'quotes',
        context: { tenantId: tenant1.id },
        data: {
          tenant: tenant1.id,
          client: {
            customer: client1.id,
            name: client1.name,
            email: client1.email ?? 'cliente@test.com',
          },
          items: [
            {
              description: 'Diseño de Identidad de Marca',
              quantity: 1,
              unitPrice: 450,
            },
            {
              description: 'Desarrollo Landing Page Next.js',
              quantity: 1,
              unitPrice: 850,
            },
          ],
          status: 'sent',
          notes: 'Cotización con validez de 15 días.',
        },
      })

      const res = await convertQuoteToInvoiceAction({
        quoteId: quote.id,
      })

      expect(res.error).toBeUndefined()
      expect(res.ok).toBe(true)
      expect(res.invoiceId).toBeTypeOf('number')

      // 1. Verificar Factura creada
      const invoice = await payload.findByID({
        collection: 'invoices',
        id: res.invoiceId!,
      })

      const sourceQuoteId =
        typeof invoice.sourceQuote === 'object' && invoice.sourceQuote !== null
          ? invoice.sourceQuote.id
          : invoice.sourceQuote
      expect(sourceQuoteId).toBe(quote.id)
      expect(invoice.status).toBe('sent')
      expect(invoice.items).toHaveLength(2)
      expect(invoice.items?.[0]?.description).toBe('Diseño de Identidad de Marca')

      // 2. Verificar Cotización marcada como aceptada
      const updatedQuote = await payload.findByID({
        collection: 'quotes',
        id: quote.id,
      })
      expect(updatedQuote.status).toBe('accepted')

      // 3. Verificar Cobro generado en Payments
      const paymentsCheck = await payload.find({
        collection: 'payments',
        where: {
          and: [
            { tenant: { equals: tenant1.id } },
            { client: { equals: client1.id } },
            { notes: { contains: `cotización #${quote.id}` } },
          ],
        },
        limit: 1,
      })

      expect(paymentsCheck.docs).toHaveLength(1)
      const autoPayment = paymentsCheck.docs[0]
      expect(autoPayment.status).toBe('pendiente')
      expect(autoPayment.amount).toBe(invoice.total || 1300)
    }, 30000)

    it('bloquea la conversión si la cotización pertenece a otro tenant', async () => {
      const quoteForeign = await payload.create({
        collection: 'quotes',
        context: { tenantId: tenant2.id },
        data: {
          tenant: tenant2.id,
          client: {
            customer: client2.id,
            name: 'Cliente de otro tenant',
          },
          items: [{ description: 'Item Aislado', quantity: 1, unitPrice: 100 }],
          status: 'sent',
        },
      })

      // El usuario opera en tenant1
      vi.mocked(getWorkspaceContext).mockResolvedValueOnce({
        payload,
        user,
        tenant: tenant1,
        tenantId: tenant1.id,
        roles: ['admin'],
        canEdit: true,
        isAdmin: true,
      })

      const res = await convertQuoteToInvoiceAction({
        quoteId: quoteForeign.id,
      })

      expect(res.ok).toBe(false)
      expect(res.error).toContain('La cotización no pertenece al tenant activo')
    })
  })

  describe('updateQuoteStatusAction y updateInvoiceStatusAction', () => {
    it('permite cambiar estado de cotización respetando aislamiento', async () => {
      const quote = await payload.create({
        collection: 'quotes',
        context: { tenantId: tenant1.id },
        data: {
          tenant: tenant1.id,
          client: { name: 'Cliente Quote Status' },
          items: [{ description: 'Servicio', quantity: 1, unitPrice: 200 }],
          status: 'draft',
        },
      })

      const res = await updateQuoteStatusAction({
        quoteId: quote.id,
        status: 'sent',
      })

      expect(res.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'quotes',
        id: quote.id,
      })
      expect(updated.status).toBe('sent')
    })

    it('permite cambiar estado de factura respetando aislamiento', async () => {
      const invoice = await payload.create({
        collection: 'invoices',
        context: { tenantId: tenant1.id },
        data: {
          tenant: tenant1.id,
          client: { name: 'Cliente Invoice Status' },
          items: [{ description: 'Licencia anual', quantity: 1, unitPrice: 990 }],
          status: 'draft',
        },
      })

      const res = await updateInvoiceStatusAction({
        invoiceId: invoice.id,
        status: 'paid',
      })

      expect(res.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'invoices',
        id: invoice.id,
      })
      expect(updated.status).toBe('paid')
    })
  })
})
