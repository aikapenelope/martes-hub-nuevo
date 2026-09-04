import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getPayload, type Payload } from 'payload'
import configPromise from '@/payload.config'
import type { Tenant, User, Client, Quote, Payment } from '@/payload-types'
import { getWorkspaceContext } from '@/lib/workspace-context'
import {
  createQuoteAction,
  convertQuoteToInvoiceAction,
  updatePaymentStatusAction,
} from '@/lib/billing-actions'
import { getWorkspaceOverviewData } from '@/lib/overview-data'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/workspace-context', () => ({
  getWorkspaceContext: vi.fn(),
}))

describe('Ofertas, Cobranzas & Cashboard Lifecycle', { timeout: 35000 }, () => {
  let payload: Payload
  let user: User
  let tenant1: Tenant
  let client1: Client

  beforeEach(async () => {
    payload = await getPayload({ config: configPromise })

    const userDoc = (await payload.find({ collection: 'users', limit: 1 })).docs[0]
    expect(userDoc).toBeDefined()
    user = userDoc

    const tenantDocs = (await payload.find({ collection: 'tenants', limit: 1 })).docs
    expect(tenantDocs.length).toBeGreaterThanOrEqual(1)
    tenant1 = tenantDocs[0]

    // Crear cliente de prueba
    client1 = (await payload.create({
      collection: 'clients',
      overrideAccess: true,
      data: {
        name: 'Cliente Test Comercial ' + Date.now(),
        email: `cliente-${Date.now()}@test.com`,
        phone: '584129990011',
        stage: 'activo',
        tenant: tenant1.id,
      },
    })) as Client

    // Mockear contexto
    vi.mocked(getWorkspaceContext).mockResolvedValue({
      payload,
      user,
      tenant: tenant1,
      tenantId: tenant1.id,
      canEdit: true,
    } as unknown as Awaited<ReturnType<typeof getWorkspaceContext>>)
  })

  describe('createQuoteAction', () => {
    it('emite una cotización comercial vinculada al cliente con cálculo de items', async () => {
      const formData = new FormData()
      formData.set('customer', String(client1.id))
      formData.set('validUntil', new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10))
      formData.set('notes', 'Condiciones: 50% anticipo')
      formData.set('redirectTo', '/workspace/offers')

      formData.set('item0_description', 'Diseño de Landing Page')
      formData.set('item0_quantity', '1')
      formData.set('item0_unitPrice', '500')
      formData.set('item0_taxRate', '0.16')

      formData.set('item1_description', 'Mantenimiento Mensual')
      formData.set('item1_quantity', '2')
      formData.set('item1_unitPrice', '150')
      formData.set('item1_taxRate', '0')

      await createQuoteAction(formData)

      // Verificar que se haya creado en la BD
      const quotesRes = await payload.find({
        collection: 'quotes',
        where: { tenant: { equals: tenant1.id } },
        sort: '-createdAt',
        limit: 1,
        overrideAccess: true,
      })

      expect(quotesRes.docs.length).toBeGreaterThan(0)
      const created = quotesRes.docs[0] as Quote
      expect(created.client.name).toBe(client1.name)
      expect(created.items?.length).toBe(2)
      expect(created.status).toBe('draft')
    })
  })

  describe('convertQuoteToInvoiceAction', () => {
    it('convierte la cotización en factura y genera el cobro pendiente en el CRM', async () => {
      const quote = (await payload.create({
        collection: 'quotes',
        overrideAccess: true,
        data: {
          tenant: tenant1.id,
          status: 'draft',
          client: {
            customer: client1.id,
            name: client1.name,
            email: client1.email ?? undefined,
          },
          items: [
            {
              description: 'Servicio Cloud Premium',
              quantity: 1,
              unitPrice: 800,
              lineTotal: 800,
            },
          ],
          total: 800,
        },
      })) as Quote

      const res = await convertQuoteToInvoiceAction({ quoteId: quote.id })
      expect(res.ok).toBe(true)
      expect(res.invoiceId).toBeDefined()

      // Verificar que la cotización cambió a accepted
      const updatedQuote = await payload.findByID({
        collection: 'quotes',
        id: quote.id,
        overrideAccess: true,
      })
      expect(updatedQuote.status).toBe('accepted')

      // Verificar que se creó el cobro en payments
      const paymentsRes = await payload.find({
        collection: 'payments',
        where: {
          and: [
            { tenant: { equals: tenant1.id } },
            { client: { equals: client1.id } },
          ],
        },
        sort: '-createdAt',
        limit: 1,
        overrideAccess: true,
      })
      expect(paymentsRes.docs.length).toBeGreaterThan(0)
      const payment = paymentsRes.docs[0] as Payment
      expect(payment.amount).toBe(928)
      expect(payment.status).toBe('pendiente')
    })
  })

  describe('updatePaymentStatusAction con conciliación bancaria', () => {
    it('confirma el cobro con método y notas de tasa BCV / referencia', async () => {
      const payment = (await payload.create({
        collection: 'payments',
        overrideAccess: true,
        data: {
          tenant: tenant1.id,
          client: client1.id,
          amount: 250,
          concept: 'Mensualidad Soporte',
          dueDate: new Date().toISOString(),
          status: 'pendiente',
        },
      })) as Payment

      const res = await updatePaymentStatusAction({
        paymentId: payment.id,
        status: 'pagado',
        method: 'pago_movil',
        notes: '[Conciliación]: Ref: 894012 Banesco | Tasa BCV: 65.20 (Bs. 16,300.00)',
      })

      expect(res.ok).toBe(true)

      const updated = await payload.findByID({
        collection: 'payments',
        id: payment.id,
        overrideAccess: true,
      })

      expect(updated.status).toBe('pagado')
      expect(updated.method).toBe('pago_movil')
      expect(updated.paidAt).toBeDefined()
      expect(updated.notes).toContain('Ref: 894012 Banesco')
      expect(updated.notes).toContain('Tasa BCV: 65.20')
    })
  })

  describe('getWorkspaceOverviewData (Cashboard)', () => {
    it('calcula correctamente ticket promedio y métricas de cotizaciones activas', async () => {
      // Crear cobro pagado
      await payload.create({
        collection: 'payments',
        overrideAccess: true,
        data: {
          tenant: tenant1.id,
          client: client1.id,
          amount: 300,
          concept: 'Cobro Período 1',
          dueDate: new Date().toISOString(),
          status: 'pagado',
          paidAt: new Date().toISOString(),
        },
      })

      // Crear cotización activa
      await payload.create({
        collection: 'quotes',
        overrideAccess: true,
        data: {
          tenant: tenant1.id,
          status: 'sent',
          client: {
            customer: client1.id,
            name: client1.name,
          },
          items: [
            {
              description: 'Servicio Propuesta',
              quantity: 1,
              unitPrice: 1200,
            },
          ],
          total: 1200,
        },
      })

      const data = await getWorkspaceOverviewData({
        payload,
        user,
        tenant: tenant1,
        tenantId: tenant1.id,
        timeRange: '30d',
      })

      expect(data.metrics.averageTicket).toBeGreaterThan(0)
      expect(data.metrics.quotesActiveCount).toBeGreaterThanOrEqual(1)
      expect(data.metrics.quotesActiveTotal).toBeGreaterThanOrEqual(1200)
    })
  })
})
