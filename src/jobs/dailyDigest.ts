import type { TaskConfig } from 'payload'

import { caracasDayRange, caracasIsoDate } from './paymentReminders'

export const dailyDigestTask: TaskConfig = {
  slug: 'daily-digest',
  label: 'Digest diario interno',
  schedule: [
    {
      cron: '0 12 * * *',
      queue: 'dinero',
    },
  ],
  inputSchema: [],
  outputSchema: [
    { name: 'sent', type: 'checkbox' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const today = caracasDayRange(caracasIsoDate(0))
    const in7Days = caracasDayRange(caracasIsoDate(7))
    const weekAhead = caracasDayRange(caracasIsoDate(7))

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    let totalSent = 0
    const summaries: string[] = []

    for (const tenant of tenants.docs) {
      const settingsRes = await req.payload.find({
        collection: 'company-settings',
        where: { tenant: { equals: tenant.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const settings = settingsRes.docs[0]
      const to = settings?.internalNotificationsEmail

      const dueSoon = await req.payload.count({
        collection: 'payments',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'pendiente' } },
            { dueDate: { greater_than_equal: today.start.toISOString() } },
            { dueDate: { less_than_equal: weekAhead.end.toISOString() } },
          ],
        },
        req,
      })

      const overdueToday = await req.payload.find({
        collection: 'payments',
        depth: 1,
        limit: 5,
        sort: 'dueDate',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'vencido' } },
            { dueDate: { less_than: today.start.toISOString() } },
          ],
        },
        overrideAccess: true,
        req,
      })

      const newLeads = await req.payload.count({
        collection: 'leads',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            {
              createdAt: {
                greater_than_equal: today.start.toISOString(),
                less_than_equal: today.end.toISOString(),
              },
            },
          ],
        },
        req,
      })

      const renewals = await req.payload.count({
        collection: 'memberships',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'activa' } },
            { renewalDate: { greater_than_equal: today.start.toISOString() } },
            { renewalDate: { less_than_equal: in7Days.end.toISOString() } },
          ],
        },
        req,
      })

      const summary =
        `[${tenant.name}] Pagos por vencer (7d): ${dueSoon.totalDocs} · ` +
        `Vencidos: ${overdueToday.totalDocs} · ` +
        `Leads nuevos hoy: ${newLeads.totalDocs} · ` +
        `Renovaciones (7d): ${renewals.totalDocs}`

      summaries.push(summary)
      req.payload.logger.info({ msg: 'daily-digest', tenant: tenant.name, summary })

      if (to) {
        const overdueLines = overdueToday.docs
          .map((p) => {
            const client = typeof p.client === 'object' ? p.client : null
            return `<li>${client?.name ?? 'Cliente'} — $${p.amount?.toFixed(2)} — vencía ${String(p.dueDate).slice(0, 10)}</li>`
          })
          .join('')

        await req.payload.sendEmail({
          to,
          subject: `[${tenant.name}] Digest diario ${caracasIsoDate(0)}`,
          html: `
            <h2>Digest diario — ${tenant.name}</h2>
            <ul>
              <li>Pagos por vencer en los próximos 7 días: <strong>${dueSoon.totalDocs}</strong></li>
              <li>Pagos vencidos: <strong>${overdueToday.totalDocs}</strong></li>
              <li>Leads nuevos hoy: <strong>${newLeads.totalDocs}</strong></li>
              <li>Membresías que renuevan en 7 días: <strong>${renewals.totalDocs}</strong></li>
            </ul>
            ${overdueToday.docs.length > 0 ? `<h3>Vencidos (primeros 5)</h3><ul>${overdueLines}</ul>` : ''}
            <p style="color:#888">Generado por Martes Hub · America/Caracas</p>
          `,
        })
        totalSent++
      }
    }

    return {
      output: {
        sent: totalSent > 0,
        summary: summaries.join(' | ') || 'Sin tenants procesados',
      },
    }
  },
}

