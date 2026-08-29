/**
 * Job: enviar campañas de email programadas cuya scheduledAt ya pasó.
 *
 * Patrón (ADVANCED.md > Jobs Queue):
 *  1. Itera todos los tenants.
 *  2. Busca campañas en estado 'draft' con scheduledAt <= now.
 *  3. Las marca como 'sending' para evitar doble-envío.
 *  4. Encola send-campaign-batch usando payload.jobs.queue (mismo patrón que
 *     sendCampaign.ts — con overrideAccess: true y req para la transacción).
 *
 * Activar en producción con la variable de entorno:
 *   EMAIL_CAMPAIGNS_AUTO_SEND=true
 *
 * Mientras sea false (defecto), el job hace early-return con un warning
 * sin alterar los datos.
 */

import type { TaskConfig } from 'payload'

const autoSendEnabled = process.env.EMAIL_CAMPAIGNS_AUTO_SEND === 'true'

// El slug se incorpora a TaskType en payload-types.ts al regenerar tipos
// (automático en dev start y en build). El cast permite compilar antes de eso.
export const sendScheduledCampaignsTask: TaskConfig = {
  slug: 'send-scheduled-campaigns' as TaskConfig['slug'],
  label: 'Enviar campañas de email programadas',
  schedule: [{ cron: '*/15 * * * *', queue: 'email' }],
  inputSchema: [],
  outputSchema: [
    { name: 'queued', type: 'number' },
    { name: 'skipped', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    if (!autoSendEnabled) {
      req.payload.logger.warn({
        msg: 'send-scheduled-campaigns: EMAIL_CAMPAIGNS_AUTO_SEND no está activado; campañas en espera',
      })
      return {
        output: {
          queued: 0,
          skipped: 0,
          summary: 'Envío automático desactivado; campañas no procesadas',
        },
      }
    }

    if (!process.env.RESEND_API_KEY) {
      req.payload.logger.warn({
        msg: 'send-scheduled-campaigns: RESEND_API_KEY no configurado; saltando',
      })
      return {
        output: {
          queued: 0,
          skipped: 0,
          summary: 'RESEND_API_KEY no configurado',
        },
      }
    }

    const now = new Date().toISOString()

    const tenants = await req.payload.find({
      collection: 'tenants',
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })

    let totalQueued = 0
    let totalSkipped = 0

    for (const tenant of tenants.docs) {
      const due = await req.payload.find({
        collection: 'email-campaigns',
        where: {
          and: [
            { tenant: { equals: tenant.id } },
            { status: { equals: 'draft' } },
            { scheduledAt: { less_than_equal: now } },
            { scheduledAt: { exists: true } },
          ],
        },
        limit: 20,
        depth: 0,
        overrideAccess: true,
        req,
      })

      for (const campaign of due.docs) {
        if (!campaign.subject || !campaign.bodyHtml) {
          totalSkipped++
          req.payload.logger.warn({
            msg: 'send-scheduled-campaigns: campaña sin asunto o cuerpo, saltando',
            campaignId: campaign.id,
            tenant: tenant.name,
          })
          continue
        }

        // Marcar como 'sending' antes de encolar — previene doble envío si el
        // cron se ejecuta dos veces antes de que el job de envío empiece.
        await req.payload.update({
          collection: 'email-campaigns',
          id: campaign.id,
          data: { status: 'sending' },
          overrideAccess: true,
          req,
        })

        await req.payload.jobs.queue({
          task: 'send-campaign-batch',
          input: { campaignId: campaign.id, tenantId: tenant.id },
          overrideAccess: true,
          req,
        })

        totalQueued++
        req.payload.logger.info({
          msg: 'send-scheduled-campaigns: campaña encolada',
          campaignId: campaign.id,
          tenant: tenant.name,
        })
      }
    }

    const summary = `Encoladas: ${totalQueued} | Saltadas: ${totalSkipped}`
    req.payload.logger.info({ msg: 'send-scheduled-campaigns completado', summary })

    return {
      output: {
        queued: totalQueued,
        skipped: totalSkipped,
        summary,
      },
    }
  },
}
