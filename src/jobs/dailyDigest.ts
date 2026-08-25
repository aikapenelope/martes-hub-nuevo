import type { PayloadRequest, TaskConfig } from 'payload'

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

    // company-settings es una colección por tenant (isGlobal del plugin); en mono-tenant hay un solo doc
    const settingsRes = await req.payload.find({
      collection: 'company-settings',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const settings = settingsRes.docs[0]

    const dueSoon = await req.payload.count({
      collection: 'payments',
      where: {
        and: [
          { status: { equals: 'pendiente' } },
          { dueDate: { greater_than_equal: today.start.toISOString() } },
          { dueDate: { less_than_equal: weekAhead.end.toISOString() } },
        ],
      },
    })

    const overdueToday = await req.payload.find({
      collection: 'payments',
      depth: 1,
      limit: 5,
      sort: 'dueDate',
      where: {
        and: [
          { status: { equals: 'vencido' } },
          { dueDate: { less_than: today.start.toISOString() } },
        ],
      },
    })

    const newLeads = await req.payload.count({
      collection: 'leads',
      where: {
        createdAt: {
          greater_than_equal: today.start.toISOString(),
          less_than_equal: today.end.toISOString(),
        },
      },
    })

    const renewals = await req.payload.count({
      collection: 'memberships',
      where: {
        and: [
          { status: { equals: 'activa' } },
          { renewalDate: { greater_than_equal: today.start.toISOString() } },
          { renewalDate: { less_than_equal: in7Days.end.toISOString() } },
        ],
      },
    })

    const summary =
      `Pagos por vencer (7d): ${dueSoon.totalDocs} · ` +
      `Vencidos: ${overdueToday.totalDocs} · ` +
      `Leads nuevos hoy: ${newLeads.totalDocs} · ` +
      `Renovaciones (7d): ${renewals.totalDocs}`

    req.payload.logger.info({ msg: 'daily-digest', summary })

    const to = settings?.internalNotificationsEmail
    if (!to) {
      return { output: { sent: false, summary: `${summary} (sin email destino configurado)` } }
    }

    const overdueLines = overdueToday.docs
      .map((p) => {
        const client = typeof p.client === 'object' ? p.client : null
        return `<li>${client?.name ?? 'Cliente'} — $${p.amount?.toFixed(2)} — vencía ${String(p.dueDate).slice(0, 10)}</li>`
      })
      .join('')

    await req.payload.sendEmail({
      to,
      subject: `[Martes Hub] Digest diario ${caracasIsoDate(0)}`,
      html: `
        <h2>Digest diario</h2>
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

    return { output: { sent: true, summary } }
  },
}
