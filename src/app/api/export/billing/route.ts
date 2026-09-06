import { getWorkspaceContext } from '@/lib/workspace-context'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContext()
  const searchParams = request.nextUrl.searchParams
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  
  let dateQuery: any = undefined
  if (from && to) {
    dateQuery = {
      and: [
        { dueDate: { greater_than_equal: new Date(from).toISOString() } },
        { dueDate: { less_than_equal: new Date(to).toISOString() } }
      ]
    }
  } else if (from) {
    dateQuery = { dueDate: { greater_than_equal: new Date(from).toISOString() } }
  } else if (to) {
    dateQuery = { dueDate: { less_than_equal: new Date(to).toISOString() } }
  } else {
    // Default: último mes
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    dateQuery = { dueDate: { greater_than_equal: lastMonth.toISOString() } }
  }

  const paymentsRes = await context.payload.find({
    collection: 'payments',
    where: {
      and: [
        { tenant: { equals: context.tenantId } },
        ...(dateQuery ? [dateQuery] : [])
      ]
    },
    limit: 1000,
    overrideAccess: false,
    user: context.user,
  })

  let csvContent = 'Fecha,Cliente,Concepto,Monto USD,Método de Pago,Estado\n'
  
  for (const p of paymentsRes.docs as any[]) {
    const clientName = typeof p.client === 'object' && p.client ? p.client.name : 'Desconocido'
    const date = p.dueDate ? new Date(p.dueDate).toLocaleDateString() : ''
    
    // Escapar comillas dobles y comas en CSV
    const escapeCsv = (str: string) => {
      if (!str) return '""'
      return '"' + String(str).replace(/"/g, '""') + '"'
    }
    
    csvContent += [
      escapeCsv(date),
      escapeCsv(clientName),
      escapeCsv(p.concept || ''),
      p.amount || 0,
      escapeCsv(p.method || ''),
      escapeCsv(p.status || '')
    ].join(',') + '\n'
  }

  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="cobros-${fecha}.csv"`
    }
  })
}
