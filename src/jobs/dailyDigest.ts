import type { TaskConfig } from 'payload'

import { escapeHtml } from '@/lib/html-escape'

function getLocalHour(timeZone: string, now = new Date()): number {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(now)
    const hour = parseInt(hourStr, 10)
    return hour === 24 ? 0 : hour
  } catch {
    return now.getUTCHours()
  }
}

function tenantDayRange(timeZone: string, offsetDays = 0): { start: Date; end: Date; isoDate: string } {
  try {
    const target = new Date(Date.now() + offsetDays * 86_400_000)
    const isoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(target)
    const start = new Date(`${isoDate}T00:00:00Z`)
    const end = new Date(`${isoDate}T23:59:59.999Z`)
    return { start, end, isoDate }
  } catch {
    const target = new Date(Date.now() + offsetDays * 86_400_000)
    const isoDate = target.toISOString().slice(0, 10)
    const start = new Date(`${isoDate}T00:00:00Z`)
    const end = new Date(`${isoDate}T23:59:59.999Z`)
    return { start, end, isoDate }
  }
}

export function shouldDispatchDigest({
  currentHour,
  targetHour,
  alreadyDispatchedToday,
}: {
  currentHour: number
  targetHour: number
  alreadyDispatchedToday: boolean
}): boolean {
  if (alreadyDispatchedToday) return false
  return currentHour >= targetHour
}

export const dailyDigestTask: TaskConfig = {
  slug: 'daily-digest',
  label: 'Digest diario interno',
  schedule: [
    {
      cron: '0 * * * *',
      queue: 'dinero',
    },
  ],
  inputSchema: [],
  outputSchema: [
    { name: 'sent', type: 'checkbox' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const now = new Date()

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
      const timezone = settings?.timezone || 'America/Caracas'
      const targetHour = settings?.digestHour ?? 8
      const safeTenantName = escapeHtml(tenant.name ?? '')

      const today = tenantDayRange(timezone, 0)
      const digestSubject = `[${safeTenantName}] Digest diario ${today.isoDate}`

      const currentHour = getLocalHour(timezone, now)

      // Verificar si ya se despachó el digest para este tenant y fecha calendario (idempotencia)
      const alreadySentRes = await req.payload.find({
        collection: 'email-log',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { subject: { equals: digestSubject } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const alreadyDispatchedToday = alreadySentRes.totalDocs > 0

      if (!shouldDispatchDigest({ currentHour, targetHour, alreadyDispatchedToday })) {
        continue
      }

      const in7Days = tenantDayRange(timezone, 7)
      const to = settings?.internalNotificationsEmail

      const dueSoon = await req.payload.count({
        collection: 'payments',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'pendiente' } },
            { dueDate: { greater_than_equal: today.start.toISOString() } },
            { dueDate: { less_than_equal: in7Days.end.toISOString() } },
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
            const safeClientName = escapeHtml(client?.name ?? 'Cliente')
            return `<li>${safeClientName} — $${p.amount?.toFixed(2)} — vencía ${escapeHtml(String(p.dueDate).slice(0, 10))}</li>`
          })
          .join('')

        await req.payload.sendEmail({
          to,
          subject: digestSubject,
          html: `
            <h2>Digest diario — ${safeTenantName}</h2>
            <ul>
              <li>Pagos por vencer en los próximos 7 días: <strong>${dueSoon.totalDocs}</strong></li>
              <li>Pagos vencidos: <strong>${overdueToday.totalDocs}</strong></li>
              <li>Leads nuevos hoy: <strong>${newLeads.totalDocs}</strong></li>
              <li>Membresías que renuevan en 7 días: <strong>${renewals.totalDocs}</strong></li>
            </ul>
            ${overdueToday.docs.length > 0 ? `<h3>Vencidos (primeros 5)</h3><ul>${overdueLines}</ul>` : ''}
            <p style="color:#888">Generado por Martes Hub · ${escapeHtml(timezone)}</p>
          `,
        })

        // Registrar en email-log para asegurar idempotencia absoluta del día
        await req.payload.create({
          collection: 'email-log',
          data: {
            tenant: tenant.id,
            to,
            subject: digestSubject,
            status: 'sent',
            source: 'transactional',
          },
          overrideAccess: true,
          req,
        })

        totalSent++
      } else {
        // Si el tenant no tiene email configurado, registrar como skip para no reprocesar cada hora
        await req.payload.create({
          collection: 'email-log',
          data: {
            tenant: tenant.id,
            to: 'digest-internal@martes.app',
            subject: digestSubject,
            status: 'sent',
            source: 'transactional',
          },
          overrideAccess: true,
          req,
        })
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
