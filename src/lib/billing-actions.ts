'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Client, Lead } from '@/payload-types'

const MAX_CONCEPT = 240
const MAX_NOTES = 2000
const MAX_ITEM_ROWS = 6

function safeInternalRedirectUrl(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  // Evitar Open Redirect: debe ser ruta interna relativa absoluta iniciada por '/', sin '//' ni protocolos '://'
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) {
    return raw
  }
  return fallback
}

function assertEditor(canEdit: boolean): void {
  if (!canEdit) throw new Error('No tienes permiso para modificar cobros')
}

function requiredText(formData: FormData, key: string, max: number): string {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${key} es obligatorio`)
  return value.trim().slice(0, max)
}

function optionalText(formData: FormData, key: string, max: number): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.trim().slice(0, max)
}

function requiredNumericId(formData: FormData, key: string): number {
  const value = Number(formData.get(key))
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Selecciona un valor válido para ${key}`)
  return value
}

/**
 * Crea un cobro directamente desde el workspace — reemplaza el link a
 * `/admin/collections/payments/create`. Mismo patrón que
 * `crm-actions.ts` (Server Action + `overrideAccess: false` + `user`).
 */
export async function createPaymentAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const clientId = requiredNumericId(formData, 'client')
  // Verifica que el cliente pertenezca al tenant activo antes de crear el cobro
  const clientCheck = await context.payload.find({
    collection: 'clients',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: clientId } }, { tenant: { equals: context.tenantId } }] },
  })
  if (clientCheck.docs.length === 0) throw new Error('Cliente no encontrado en el tenant activo')

  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0')

  const dueDateRaw = requiredText(formData, 'dueDate', 20)
  const method = optionalText(formData, 'method', 30)

  await context.payload.create({
    collection: 'payments',
    overrideAccess: false,
    user: context.user,
    context: { tenantId: context.tenantId },
    data: {
      tenant: context.tenantId,
      client: clientId,
      amount,
      concept: optionalText(formData, 'concept', MAX_CONCEPT),
      dueDate: new Date(dueDateRaw).toISOString(),
      status: 'pendiente',
      method: method as
        | 'pago_movil'
        | 'transferencia'
        | 'zelle'
        | 'binance'
        | 'efectivo'
        | 'otro'
        | undefined,
      notes: optionalText(formData, 'notes', MAX_NOTES),
    },
  })

  revalidatePath('/workspace')
  revalidatePath('/workspace/billing')
}

interface QuoteInvoiceItem {
  product?: number
  description: string
  quantity: number
  unitPrice: number
  taxRate?: number
}

/** Lee hasta MAX_ITEM_ROWS filas `item{N}_...` del FormData; descarta filas sin descripción. */
function parseItemRows(formData: FormData): QuoteInvoiceItem[] {
  const items: QuoteInvoiceItem[] = []
  for (let i = 0; i < MAX_ITEM_ROWS; i++) {
    const description = formData.get(`item${i}_description`)
    if (typeof description !== 'string' || !description.trim()) continue

    const quantity = Number(formData.get(`item${i}_quantity`)) || 1
    const unitPrice = Number(formData.get(`item${i}_unitPrice`)) || 0
    const productRaw = formData.get(`item${i}_product`)
    const productId = productRaw ? Number(productRaw) : undefined
    const taxRateRaw = formData.get(`item${i}_taxRate`)
    const taxRate = taxRateRaw ? Number(taxRateRaw) : undefined

    items.push({
      description: description.trim().slice(0, 240),
      quantity: quantity > 0 ? quantity : 1,
      unitPrice: unitPrice >= 0 ? unitPrice : 0,
      ...(productId && Number.isInteger(productId) && productId > 0 ? { product: productId } : {}),
      ...(taxRate !== undefined && Number.isFinite(taxRate) ? { taxRate } : {}),
    })
  }
  if (items.length === 0) throw new Error('Agrega al menos un concepto con descripción')
  return items
}

async function resolveClientGroup(
  context: Awaited<ReturnType<typeof getWorkspaceContext>>,
  formData: FormData,
): Promise<{ customer?: number; name: string; email?: string }> {
  const customerRaw = formData.get('customer')
  const customerId = customerRaw ? Number(customerRaw) : undefined

  if (customerId && Number.isInteger(customerId) && customerId > 0) {
    const check = await context.payload.find({
      collection: 'clients',
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
      where: { and: [{ id: { equals: customerId } }, { tenant: { equals: context.tenantId } }] },
    })
    const client = check.docs[0]
    if (!client) throw new Error('Cliente no encontrado en el tenant activo')
    return { customer: customerId, name: client.name, email: client.email ?? undefined }
  }

  return {
    name: requiredText(formData, 'clientName', 160),
    email: optionalText(formData, 'clientEmail', 240),
  }
}

/**
 * Crea una cotización directamente desde el workspace — reemplaza el link
 * a `/admin/collections/quotes/create`. `payload-invoicepdf` genera el PDF
 * y el número de cotización en su propio `beforeChange` hook, igual que si
 * se creara desde el admin.
 */
export async function createQuoteAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const client = await resolveClientGroup(context, formData)
  const items = parseItemRows(formData)
  const validUntilRaw = optionalText(formData, 'validUntil', 20)

  const quote = await context.payload.create({
    collection: 'quotes',
    overrideAccess: false,
    user: context.user,
    context: { tenantId: context.tenantId },
    data: {
      tenant: context.tenantId,
      client,
      items,
      validUntil: validUntilRaw ? new Date(validUntilRaw).toISOString() : undefined,
      notes: optionalText(formData, 'notes', MAX_NOTES),
      status: 'draft',
    },
  })

  revalidatePath('/workspace/billing')
  revalidatePath('/workspace/offers')
  revalidatePath('/workspace')
  const rawRedirect = optionalText(formData, 'redirectTo', 200)
  const redirectTo = safeInternalRedirectUrl(rawRedirect, `/workspace/billing?created=quote-${quote.id}`)
  redirect(redirectTo)
}

/**
 * Crea una factura directamente desde el workspace — reemplaza el link a
 * `/admin/collections/invoices/create`.
 */
export async function createInvoiceAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  assertEditor(context.canEdit)

  const client = await resolveClientGroup(context, formData)
  const items = parseItemRows(formData)
  const dueDateRaw = optionalText(formData, 'dueDate', 20)

  const invoice = await context.payload.create({
    collection: 'invoices',
    overrideAccess: false,
    user: context.user,
    context: { tenantId: context.tenantId },
    data: {
      tenant: context.tenantId,
      client,
      items,
      dueDate: dueDateRaw ? new Date(dueDateRaw).toISOString() : undefined,
      notes: optionalText(formData, 'notes', MAX_NOTES),
      status: 'draft',
    },
  })

  revalidatePath('/workspace/billing')
  redirect(`/workspace/billing?created=invoice-${invoice.id}`)
}

/**
 * Actualiza el estado de un cobro in-situ (ej. marcar como pagado, anular o reactivar)
 * sin salir del workspace ni requerir acceso a /admin.
 */
export async function updatePaymentStatusAction(params: {
  paymentId: number
  status: 'pendiente' | 'pagado' | 'vencido' | 'anulado'
  method?: 'pago_movil' | 'transferencia' | 'zelle' | 'binance' | 'efectivo' | 'otro'
  paidAt?: string
  notes?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const check = await context.payload.find({
      collection: 'payments',
      where: {
        and: [
          { id: { equals: params.paymentId } },
          { tenant: { equals: context.tenantId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    if (check.docs.length === 0) {
      return { ok: false, error: 'Cobro no encontrado o sin permisos en este tenant' }
    }

    const dataToUpdate: Record<string, unknown> = {
      status: params.status,
    }

    if (params.status === 'pagado') {
      dataToUpdate.paidAt = params.paidAt || new Date().toISOString()
      if (params.method) dataToUpdate.method = params.method
    } else if (params.status === 'pendiente' || params.status === 'vencido') {
      dataToUpdate.paidAt = null
    }

    if (params.notes !== undefined) {
      dataToUpdate.notes = params.notes.slice(0, MAX_NOTES)
    }

    await context.payload.update({
      collection: 'payments',
      id: params.paymentId,
      overrideAccess: false,
      user: context.user,
      data: dataToUpdate,
    })

    revalidatePath('/workspace')
    revalidatePath('/workspace/billing')
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar el cobro'
    return { ok: false, error: message }
  }
}

/**
 * Convierte una cotización en factura con 1 clic:
 * 1. Clona los conceptos, cliente y datos a una nueva factura.
 * 2. Asocia `sourceQuote` a la cotización de origen.
 * 3. Actualiza el estado de la cotización a 'accepted'.
 * 4. Si el cliente está en el CRM, genera el cobro pendiente asociado.
 */
export async function convertQuoteToInvoiceAction(params: {
  quoteId: number
  dueDate?: string
}): Promise<{ ok: boolean; invoiceId?: number; error?: string }> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const quote = await context.payload.findByID({
      collection: 'quotes',
      id: params.quoteId,
      depth: 1,
      overrideAccess: false,
      user: context.user,
    })

    if (!quote) {
      return { ok: false, error: 'Cotización no encontrada' }
    }

    const quoteTenantId = typeof quote.tenant === 'object' ? quote.tenant?.id : quote.tenant
    if (quoteTenantId !== context.tenantId) {
      return { ok: false, error: 'La cotización no pertenece al tenant activo' }
    }

    const items = (quote.items || []).map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate ?? undefined,
      ...(it.product && typeof it.product === 'object'
        ? { product: it.product.id }
        : typeof it.product === 'number'
          ? { product: it.product }
          : {}),
    }))

    const customerId =
      typeof quote.client?.customer === 'object'
        ? quote.client.customer?.id
        : typeof quote.client?.customer === 'number'
          ? quote.client.customer
          : undefined

    const dueDate = params.dueDate || new Date(Date.now() + 30 * 86400000).toISOString()

    const invoice = await context.payload.create({
      collection: 'invoices',
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: {
        tenant: context.tenantId,
        client: {
          customer: customerId,
          name: quote.client.name,
          email: quote.client.email,
          address: quote.client.address,
          vatNumber: quote.client.vatNumber,
        },
        items,
        dueDate,
        notes: quote.notes || undefined,
        status: 'sent',
        sourceQuote: quote.id,
      },
    })

    if (customerId) {
      await context.payload.create({
        collection: 'payments',
        overrideAccess: false,
        user: context.user,
        context: { tenantId: context.tenantId },
        data: {
          tenant: context.tenantId,
          client: customerId,
          amount: invoice.total || quote.total || 0,
          concept: `Factura ${invoice.invoiceNumber || '#' + invoice.id} (${quote.quoteNumber || 'Cotización #' + quote.id})`,
          dueDate,
          status: 'pendiente',
          notes: `Generado automáticamente desde cotización #${quote.id}`,
        },
      })
    }

    if (quote.status !== 'accepted') {
      await context.payload.update({
        collection: 'quotes',
        id: quote.id,
        overrideAccess: false,
        user: context.user,
        context: { tenantId: context.tenantId },
        data: {
          status: 'accepted',
        },
      })
    }

    revalidatePath('/workspace')
    revalidatePath('/workspace/billing')
    revalidatePath('/workspace/offers')
    return { ok: true, invoiceId: invoice.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al convertir cotización a factura'
    return { ok: false, error: message }
  }
}

/**
 * Actualiza el estado de una cotización (draft -> sent -> accepted / rejected / expired).
 */
export async function updateQuoteStatusAction(params: {
  quoteId: number
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const check = await context.payload.find({
      collection: 'quotes',
      where: {
        and: [
          { id: { equals: params.quoteId } },
          { tenant: { equals: context.tenantId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    if (check.docs.length === 0) {
      return { ok: false, error: 'Cotización no encontrada' }
    }

    await context.payload.update({
      collection: 'quotes',
      id: params.quoteId,
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: { status: params.status },
    })

    revalidatePath('/workspace/billing')
    revalidatePath('/workspace/offers')
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar cotización' }
  }
}

/**
 * Actualiza el estado de una factura (draft -> sent -> paid / overdue / cancelled).
 */
export async function updateInvoiceStatusAction(params: {
  invoiceId: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const context = await getWorkspaceContext()
    assertEditor(context.canEdit)

    const check = await context.payload.find({
      collection: 'invoices',
      where: {
        and: [
          { id: { equals: params.invoiceId } },
          { tenant: { equals: context.tenantId } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: context.user,
    })

    if (check.docs.length === 0) {
      return { ok: false, error: 'Factura no encontrada' }
    }

    await context.payload.update({
      collection: 'invoices',
      id: params.invoiceId,
      overrideAccess: false,
      user: context.user,
      context: { tenantId: context.tenantId },
      data: { status: params.status },
    })

    revalidatePath('/workspace')
    revalidatePath('/workspace/billing')
    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar factura' }
  }
}

export interface RecipientSearchResult {
  id: string
  name: string
  companyName?: string
  email?: string
  type: 'client' | 'lead'
  customerId?: number
}

/**
 * Búsqueda reactiva de destinatarios (Clientes y Leads) que sobrepasa el límite inicial de 200,
 * permitiendo al cotizador buscar cualquier registro histórico del CRM del tenant.
 */
export async function searchRecipientsAction(query: string): Promise<RecipientSearchResult[]> {
  try {
    const context = await getWorkspaceContext()
    const q = query.trim().toLowerCase()
    if (!q) return []

    const [clientsRes, leadsRes] = await Promise.all([
      context.payload.find({
        collection: 'clients',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            {
              or: [
                { name: { contains: q } },
                { companyName: { contains: q } },
                { email: { contains: q } },
              ],
            },
          ],
        },
        limit: 25,
        depth: 0,
        overrideAccess: false,
        user: context.user,
      }),
      context.payload.find({
        collection: 'leads',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { status: { not_in: ['descartado'] } },
            {
              or: [
                { fullName: { contains: q } },
                { companyName: { contains: q } },
                { email: { contains: q } },
              ],
            },
          ],
        },
        limit: 25,
        depth: 0,
        overrideAccess: false,
        user: context.user,
      }),
    ])

    const results: RecipientSearchResult[] = []
    for (const c of clientsRes.docs as Client[]) {
      results.push({
        id: `client_${c.id}`,
        customerId: c.id,
        name: c.name,
        companyName: c.companyName || undefined,
        email: c.email || undefined,
        type: 'client',
      })
    }
    for (const l of leadsRes.docs as Lead[]) {
      results.push({
        id: `lead_${l.id}`,
        name: l.fullName,
        companyName: l.companyName || undefined,
        email: l.email || undefined,
        type: 'lead',
      })
    }

    return results
  } catch (err) {
    console.error('[searchRecipientsAction] Error buscando destinatarios:', err)
    return []
  }
}
