import type { PayloadRequest, TaskConfig } from 'payload'
import type { Payment } from '@/payload-types'

export function caracasIsoDate(offsetDays: number): string {
  return new Date(Date.now() - 4 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export function caracasDayRange(isoDate: string): { start: Date; end: Date } {
  return {
    start: new Date(`${isoDate}T00:00:00-04:00`),
    end: new Date(`${isoDate}T23:59:59.999-04:00`),
  }
}

async function markOverdue(req: PayloadRequest): Promise<number> {
  const today = caracasDayRange(caracasIsoDate(0))
  const overdue = await req.payload.update({
    collection: 'payments',
    where: {
      and: [
        { status: { equals: 'pendiente' } },
        { dueDate: { less_than: today.start.toISOString() } },
      ],
    },
    data: { status: 'vencido' },
    overrideAccess: true,
  })
  return overdue.docs.length
}

export const paymentRemindersTask: TaskConfig = {
  slug: 'payment-reminders',
  label: 'Recordatorios de cobro',
  schedule: [
    {
      cron: '0 12 * * *',
      queue: 'dinero',
    },
  ],
  inputSchema: [],
  outputSchema: [
    { name: 'reminded', type: 'number' },
    { name: 'markedOverdue', type: 'number' },
    { name: 'skippedNoEmail', type: 'number' },
  ],
  handler: async ({ req }) => {
    const tomorrow = caracasDayRange(caracasIsoDate(1))

    const markedOverdue = await markOverdue(req)

    const dueTomorrow = await req.payload.find({
      collection: 'payments',
      depth: 1,
      limit: 100,
      where: {
        and: [
          { status: { equals: 'pendiente' } },
          { dueDate: { greater_than_equal: tomorrow.start.toISOString() } },
          { dueDate: { less_than_equal: tomorrow.end.toISOString() } },
          { reminderSentAt: { exists: false } },
        ],
      },
      overrideAccess: true,
    })

    let reminded = 0
    let skippedNoEmail = 0

    for (const payment of dueTomorrow.docs as Payment[]) {
      const client = typeof payment.client === 'object' ? payment.client : null
      const email = client?.email
      if (!email) {
        skippedNoEmail += 1
        continue
      }

      await req.payload.sendEmail({
        to: email,
        subject: `Recordatorio: pago de $${payment.amount?.toFixed(2)} vence mañana`,
        html: `
          <p>Hola ${client?.name ?? ''},</p>
          <p>Te recordamos que tu pago de <strong>$${payment.amount?.toFixed(2)} USD</strong>${
            payment.concept ? ` (${payment.concept})` : ''
          } vence <strong>mañana</strong>.</p>
          <p>Quedamos atentos a tu confirmación.</p>
          <p style="color:#888">— Martes Hub</p>
        `,
      })

      await req.payload.update({
        collection: 'payments',
        id: payment.id,
        data: { reminderSentAt: new Date().toISOString() },
        overrideAccess: true,
      })
      reminded += 1
    }

    req.payload.logger.info({
      msg: 'payment-reminders completado',
      reminded,
      markedOverdue,
      skippedNoEmail,
    })

    return { output: { reminded, markedOverdue, skippedNoEmail } }
  },
}
