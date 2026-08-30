'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getWorkspaceContext } from '@/lib/workspace-context'

const MAX_CONCEPT = 240
const MAX_NOTES = 2000
const MAX_ITEM_ROWS = 6

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
    data: {
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
  redirect(`/workspace/billing?created=quote-${quote.id}`)
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

