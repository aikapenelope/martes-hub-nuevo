import { getWorkspaceContext } from '@/lib/workspace-context'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContext()

  const clientsRes = await context.payload.find({
    collection: 'clients',
    where: { tenant: { equals: context.tenantId } },
    limit: 5000,
    overrideAccess: false,
    user: context.user,
  })

  let csvContent = 'Nombre,Empresa,Teléfono,Email,Etapa,Rubro,Agente Asignado\n'
  
  for (const c of clientsRes.docs as any[]) {
    // Escapar comillas dobles y comas en CSV
    const escapeCsv = (str: string) => {
      if (!str) return '""'
      return '"' + String(str).replace(/"/g, '""') + '"'
    }

    const companyName = typeof c.company === 'object' && c.company ? c.company.name : (c.companyName || '')
    const segmentName = typeof c.segment === 'object' && c.segment ? c.segment.name : ''
    const agentName = typeof c.assignedAgent === 'object' && c.assignedAgent ? (c.assignedAgent.firstName || c.assignedAgent.email) : ''
    
    csvContent += [
      escapeCsv(c.name),
      escapeCsv(companyName),
      escapeCsv(c.phone || ''),
      escapeCsv(c.email || ''),
      escapeCsv(c.stage || ''),
      escapeCsv(segmentName),
      escapeCsv(agentName)
    ].join(',') + '\n'
  }

  const fecha = new Date().toISOString().slice(0, 10)

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes-${fecha}.csv"`
    }
  })
}
