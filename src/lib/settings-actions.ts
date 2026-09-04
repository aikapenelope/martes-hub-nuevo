'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getWorkspaceContext } from '@/lib/workspace-context'

export async function updateCompanySettingsAction(formData: FormData): Promise<void> {
  const submittedTenantIdRaw = formData.get('tenantId')
  const submittedTenantId = submittedTenantIdRaw ? Number(submittedTenantIdRaw) : undefined

  if (submittedTenantId !== undefined && (!Number.isInteger(submittedTenantId) || submittedTenantId <= 0)) {
    throw new Error('Identificador de tenant inválido.')
  }

  const context = await getWorkspaceContext(
    submittedTenantId ? { tenant: String(submittedTenantId) } : undefined
  )

  if (submittedTenantId && context.tenantId !== submittedTenantId) {
    throw new Error('No tienes acceso al tenant especificado.')
  }

  const isAdmin = Boolean(context.user.roles?.includes('admin'))
  if (!isAdmin) {
    throw new Error('Solo los administradores pueden modificar la configuración de la empresa.')
  }

  // 1. Validar nombre de la empresa (2 a 120 caracteres)
  const companyName = String(formData.get('companyName') ?? '').trim()
  if (!companyName || companyName.length < 2 || companyName.length > 120) {
    throw new Error('El nombre de la empresa debe tener entre 2 y 120 caracteres.')
  }

  // 2. Validar zona horaria (debe ser una zona IANA válida)
  const rawTimezone = String(formData.get('timezone') ?? '').trim()
  let timezone = 'America/Caracas'
  if (rawTimezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: rawTimezone })
      timezone = rawTimezone
    } catch {
      throw new Error('La zona horaria proporcionada no es un identificador IANA válido.')
    }
  }

  // 3. Validar moneda (solo USD permitido)
  const rawCurrency = String(formData.get('currency') ?? 'USD').trim()
  if (rawCurrency !== 'USD') {
    throw new Error('Moneda no soportada. Solo se admite USD.')
  }
  const currency = 'USD' as const

  // 4. Validar hora de digest (entero 0-23)
  const digestHourRaw = Number(formData.get('digestHour') ?? 8)
  if (!Number.isInteger(digestHourRaw) || digestHourRaw < 0 || digestHourRaw > 23) {
    throw new Error('La hora del digest debe ser un número entero entre 0 y 23.')
  }
  const digestHour = digestHourRaw

  // 5. Validar email de notificaciones internas (formato email o null para vaciar)
  const rawEmail = String(formData.get('internalNotificationsEmail') ?? '').trim()
  let internalNotificationsEmail: string | null = null
  if (rawEmail) {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_REGEX.test(rawEmail) || rawEmail.length > 255) {
      throw new Error('El email de notificaciones internas debe tener un formato de correo válido.')
    }
    internalNotificationsEmail = rawEmail.toLowerCase()
  }

  // 6. Validar y procesar parámetros de IA (Worker Ligero)
  const rawAiProvider = String(formData.get('aiProvider') ?? 'groq').trim()
  const aiProvider = (['groq', 'openrouter', 'custom'].includes(rawAiProvider) ? rawAiProvider : 'groq') as
    | 'groq'
    | 'openrouter'
    | 'custom'

  const rawAiApiKey = String(formData.get('aiApiKey') ?? '').trim()
  const aiApiKey = rawAiApiKey ? rawAiApiKey.slice(0, 500) : null

  const rawAiModel = String(formData.get('aiModel') ?? '').trim()
  const aiModel = rawAiModel ? rawAiModel.slice(0, 150) : 'llama-3.3-70b-versatile'

  const aiAutoSummarize = formData.get('aiAutoSummarize') === 'on' || formData.get('aiAutoSummarize') === 'true'

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
        internalNotificationsEmail, // null borra explícitamente el valor en la base de datos
        aiProvider,
        ...(aiApiKey !== null ? { aiApiKey } : rawAiApiKey === '' ? { aiApiKey: null } : {}),
        aiModel,
        aiAutoSummarize,
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
        internalNotificationsEmail,
        aiProvider,
        aiApiKey,
        aiModel,
        aiAutoSummarize,
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
  redirect(`/workspace/settings?saved=true${submittedTenantId ? `&tenant=${submittedTenantId}` : ''}`)
}
