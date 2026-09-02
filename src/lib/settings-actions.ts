'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getWorkspaceContext } from '@/lib/workspace-context'

export async function updateCompanySettingsAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()

  const isAdmin = Boolean(context.user.roles?.includes('admin'))
  if (!isAdmin) {
    throw new Error('Solo los administradores pueden modificar la configuración de la empresa.')
  }

  const companyName = String(formData.get('companyName') ?? '').trim()
  const timezone = String(formData.get('timezone') ?? '').trim() || 'America/Caracas'
  const currency = (String(formData.get('currency') ?? 'USD').trim() as 'USD') || 'USD'
  const digestHourRaw = Number(formData.get('digestHour') ?? 8)
  const digestHour = Number.isInteger(digestHourRaw) && digestHourRaw >= 0 && digestHourRaw <= 23 ? digestHourRaw : 8
  const internalNotificationsEmail = String(formData.get('internalNotificationsEmail') ?? '').trim() || null

  if (!companyName) {
    throw new Error('El nombre de la empresa es obligatorio.')
  }

  // Buscar settings existentes para el tenant activo
  const existingRes = await context.payload.find({
    collection: 'company-settings',
    where: { tenant: { equals: context.tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existingRes.docs.length > 0) {
    await context.payload.update({
      collection: 'company-settings',
      id: existingRes.docs[0].id,
      data: {
        companyName,
        timezone,
        currency,
        digestHour,
        internalNotificationsEmail: internalNotificationsEmail ?? undefined,
      },
      overrideAccess: true,
    })
  } else {
    await context.payload.create({
      collection: 'company-settings',
      data: {
        companyName,
        timezone,
        currency,
        digestHour,
        internalNotificationsEmail: internalNotificationsEmail ?? undefined,
        tenant: context.tenantId,
      },
      overrideAccess: true,
    })
  }

  // Si el nombre de la empresa cambió, sincronizar con el tenant activo
  if (companyName !== context.tenant.name) {
    await context.payload.update({
      collection: 'tenants',
      id: context.tenantId,
      data: {
        name: companyName,
      },
      overrideAccess: true,
    })
  }

  revalidatePath('/workspace/settings')
  revalidatePath('/workspace')
  redirect('/workspace/settings?saved=true')
}
