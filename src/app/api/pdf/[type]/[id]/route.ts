import { getWorkspaceContext } from '@/lib/workspace-context'
import { NextRequest } from 'next/server'
import type { CompanySetting } from '@/payload-types'

export async function GET(request: NextRequest, props: { params: Promise<{ type: string; id: string }> }) {
  const params = await props.params
  const { type, id } = params
  
  if (type !== 'quote' && type !== 'invoice') {
    return new Response('Invalid type', { status: 400 })
  }
  
  const context = await getWorkspaceContext()
  const collection = type === 'quote' ? 'quotes' : 'invoices'
  
  const docId = Number(id)
  if (!Number.isInteger(docId)) {
    return new Response('Invalid ID', { status: 400 })
  }

  let doc: any
  try {
    doc = await context.payload.findByID({
      collection: collection as any,
      id: docId,
      overrideAccess: false,
      user: context.user,
    })
  } catch (err) {
    return new Response('Not found', { status: 404 })
  }

  const settingsRes = await context.payload.find({
    collection: 'company-settings',
    where: { tenant: { equals: context.tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  
  const settings = settingsRes.docs[0] as unknown as CompanySetting
  
  const searchParams = request.nextUrl.searchParams
  const bcvParam = searchParams.get('bcv')
  const bcvRate = bcvParam ? Number(bcvParam) : null
  
  const isInvoice = type === 'invoice'
  const docTitle = isInvoice ? 'Factura' : 'Cotización'
  const docNumber = doc.quoteNumber || doc.invoiceNumber || `${isInvoice ? 'FAC' : 'COT'}-${doc.id}`
  const tenantName = context.tenant.name || settings?.companyName || 'Empresa'
  
  const clientName = (doc.client && typeof doc.client === 'object') ? doc.client.name : 'Cliente'
  const clientEmail = (doc.client && typeof doc.client === 'object') ? doc.client.email : ''
  const clientPhone = (doc.client && typeof doc.client === 'object') ? doc.client.phone : ''

  const items = doc.items || []
  const subtotal = doc.subtotal || items.reduce((acc: number, it: any) => acc + (it.quantity * it.unitPrice), 0)
  const tax = doc.tax || 0
  const total = doc.total || (subtotal + tax)

  const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const bs = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', maximumFractionDigits: 2 })
  
  const paymentMethods = settings?.paymentMethods || {}

  let itemsHtml = ''
  for (const it of items) {
    itemsHtml += `
      <tr>
        <td>${it.description || 'Ítem'}</td>
        <td style="text-align: right">${it.quantity}</td>
        <td style="text-align: right">${usd.format(it.unitPrice)}</td>
        <td style="text-align: right">${usd.format(it.quantity * it.unitPrice)}</td>
      </tr>`
  }

  let paymentHtml = ''
  if (paymentMethods.pagoMovil || paymentMethods.zelle || paymentMethods.transferenciaVes || paymentMethods.binance || paymentMethods.swift) {
    paymentHtml = `
  <div class="payments">
    <div class="client-title">Cuentas y Métodos de Pago</div>
    <div class="payment-grid mono">`
    if (paymentMethods.pagoMovil?.banco) {
      paymentHtml += `
      <div class="payment-card">
        <div class="payment-title">Pago Móvil (Bs)</div>
        <div>Banco: ${paymentMethods.pagoMovil.banco}</div>
        <div>Cédula/RIF: ${paymentMethods.pagoMovil.cedula}</div>
        <div>Teléfono: ${paymentMethods.pagoMovil.telefono}</div>
      </div>`
    }
    if (paymentMethods.transferenciaVes?.banco) {
      paymentHtml += `
      <div class="payment-card">
        <div class="payment-title">Transferencia (Bs)</div>
        <div>Banco: ${paymentMethods.transferenciaVes.banco}</div>
        <div>Cuenta: ${paymentMethods.transferenciaVes.numeroCuenta}</div>
        <div>Titular: ${paymentMethods.transferenciaVes.titular} (${paymentMethods.transferenciaVes.rif})</div>
      </div>`
    }
    if (paymentMethods.zelle?.email) {
      paymentHtml += `
      <div class="payment-card">
        <div class="payment-title">Zelle (USD)</div>
        <div>Email: ${paymentMethods.zelle.email}</div>
        <div>Titular: ${paymentMethods.zelle.titular}</div>
      </div>`
    }
    if (paymentMethods.binance?.binanceId) {
      paymentHtml += `
      <div class="payment-card">
        <div class="payment-title">Binance Pay (USDT)</div>
        <div>ID/Email: ${paymentMethods.binance.binanceId}</div>`
      if (paymentMethods.binance.walletUsdt) {
        paymentHtml += `<div>Wallet TRC20: ${paymentMethods.binance.walletUsdt}</div>`
      }
      paymentHtml += `</div>`
    }
    if (paymentMethods.swift?.banco) {
      paymentHtml += `
      <div class="payment-card">
        <div class="payment-title">Transferencia SWIFT (USD)</div>
        <div>Banco: ${paymentMethods.swift.banco}</div>
        <div>SWIFT: ${paymentMethods.swift.swift}</div>
        <div>Cuenta: ${paymentMethods.swift.accountNumber}</div>
        <div>Titular: ${paymentMethods.swift.titular}</div>
      </div>`
    }
    paymentHtml += `
    </div>
  </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${docTitle} #${docNumber} — ${tenantName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; font-size: 11px; color: #111; background: white; padding: 40px; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #000; }
    .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
    .tenant-info { text-align: right; }
    .tenant-name { font-weight: 700; font-size: 14px; }
    .client-section { margin-bottom: 40px; }
    .client-title { font-weight: 700; text-transform: uppercase; margin-bottom: 8px; font-size: 10px; color: #666; }
    .table { w-full; width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    .table th { border-bottom: 1px solid #000; padding: 10px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 10px; }
    .table td { border-bottom: 1px solid #eee; padding: 10px; }
    .totals { width: 300px; margin-left: auto; border: 1px solid #000; padding: 20px; }
    .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .totals-row.grand-total { font-weight: 700; font-size: 14px; border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; }
    .payments { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
    .payment-grid { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; }
    .payment-card { border: 1px solid #ccc; padding: 15px; width: calc(50% - 10px); }
    .payment-title { font-weight: 700; font-size: 10px; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;">
    <button onclick="window.print()" style="background:#000;color:white;border:none;padding:8px 16px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:bold;text-transform:uppercase;">📄 Descargar / Imprimir PDF</button>
    <button onclick="window.close()" style="background:#374151;color:white;border:none;padding:8px 16px;cursor:pointer;font-family:monospace;font-size:11px;">&times; Cerrar</button>
  </div>
  
  <div class="header">
    <div>
      <div class="title">${docTitle} #${docNumber}</div>
      <div style="margin-top: 5px;" class="mono">Fecha: ${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</div>
      ${doc.validUntil ? '<div style="margin-top: 5px;" class="mono">Válida hasta: ' + new Date(doc.validUntil).toLocaleDateString() + '</div>' : ''}
    </div>
    <div class="tenant-info">
      <div class="tenant-name">${tenantName}</div>
    </div>
  </div>

  <div class="client-section">
    <div class="client-title">Emitido a:</div>
    <div style="font-weight: 700; font-size: 14px;">${clientName}</div>
    ${clientEmail ? '<div>' + clientEmail + '</div>' : ''}
    ${clientPhone ? '<div>' + clientPhone + '</div>' : ''}
  </div>

  <table class="table mono">
    <thead>
      <tr>
        <th>Descripción</th>
        <th style="text-align: right">Cant.</th>
        <th style="text-align: right">Precio Unit.</th>
        <th style="text-align: right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="totals mono">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${usd.format(subtotal)}</span>
    </div>
    <div class="totals-row">
      <span>IVA (16%)</span>
      <span>${usd.format(tax)}</span>
    </div>
    <div class="totals-row grand-total">
      <span>TOTAL USD</span>
      <span>${usd.format(total)}</span>
    </div>
    ${bcvRate ? 
    '<div class="totals-row" style="margin-top:10px; color:#666;">' +
      '<span>Tasa BCV Referencial</span>' +
      '<span>' + bs.format(bcvRate) + '</span>' +
    '</div>' +
    '<div class="totals-row" style="color:#666; font-weight:700;">' +
      '<span>TOTAL REFERENCIAL BS</span>' +
      '<span>' + bs.format(total * bcvRate) + '</span>' +
    '</div>' 
    : 
    '<div class="totals-row" style="margin-top:10px; color:#666; font-size:9px;">' +
      '<span>* Tasa BCV al momento de impresión</span>' +
    '</div>'
    }
  </div>

  ${paymentHtml}
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}
