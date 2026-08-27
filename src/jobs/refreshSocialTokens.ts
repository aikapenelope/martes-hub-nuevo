import type { TaskConfig } from 'payload'

export const refreshSocialTokensTask: TaskConfig = {
  slug: 'refresh-social-tokens',
  label: 'Renovar tokens de larga duración de Meta Graph API',
  schedule: [{ cron: '0 3 * * 0', queue: 'social' }],
  inputSchema: [],
  outputSchema: [
    { name: 'accountsChecked', type: 'number' },
    { name: 'alertsGenerated', type: 'number' },
    { name: 'summary', type: 'text' },
  ],
  handler: async ({ req }) => {
    const fifteenDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()

    const accounts = await req.payload.find({
      collection: 'social-accounts',
      where: {
        and: [
          { status: { equals: 'conectada' } },
          { tokenExpiresAt: { less_than_equal: fifteenDaysFromNow } },
        ],
      },
      depth: 0,
      limit: 50,
      overrideAccess: true,
      req,
    })

    let alertsGenerated = 0

    for (const account of accounts.docs) {
      const tenantId = typeof account.tenant === 'number' ? account.tenant : (account.tenant?.id ?? undefined)

      await req.payload.create({
        collection: 'notifications',
        data: {
          title: `[Meta Social] Token por expirar: ${account.accountName}`,
          body: `El token de acceso para la cuenta ${account.accountName} (${account.platform}) expirará pronto. Reconecta la cuenta desde el panel de administración.`,
          severity: 'warning',
          source: 'social_token_refresh',
          read: false,
          tenant: tenantId,
        },
        overrideAccess: true,
        req,
      })

      alertsGenerated++
    }

    const summary = `Cuentas revisadas: ${accounts.docs.length} | Alertas generadas: ${alertsGenerated}`
    req.payload.logger.info({ msg: 'refresh-social-tokens', summary })

    return {
      output: {
        accountsChecked: accounts.docs.length,
        alertsGenerated,
        summary,
      },
    }
  },
}
