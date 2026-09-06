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

  // 7. Validar cuentas y métodos de pago (mismos límites que CompanySettings.ts).
  // Un ID de campo ajeno al formulario nunca se persiste: solo se leen las
  // claves conocidas, con longitud y formato acotados.
  const PAYMENT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/
  const ACCOUNT_REGEX = /^[0-9\-]{10,25}$/
  const ID_REGEX = /^[A-Za-z0-9\-]{3,20}$/
  const SWIFT_REGEX = /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/

  function paymentText(name: string, max: number, label: string): string | null {
    const value = String(formData.get(name) ?? '').trim()
    if (!value) return null
    if (value.length > max) throw new Error(`${label} no puede superar los ${max} caracteres.`)
    return value
  }

  function paymentPattern(name: string, regex: RegExp, label: string, hint: string): string | null {
    const value = paymentText(name, 200, label)
    if (!value) return null
    if (!regex.test(value)) throw new Error(`${label} no tiene un formato válido. ${hint}`)
    return value
  }

  const paymentMethods = {
    pagoMovil: {
      banco: paymentText('paymentMethods.pagoMovil.banco', 100, 'El banco de Pago Móvil'),
      cedula: paymentPattern('paymentMethods.pagoMovil.cedula', ID_REGEX, 'La cédula/RIF de Pago Móvil', 'Ej: V-12345678'),
      telefono: paymentPattern('paymentMethods.pagoMovil.telefono', PHONE_REGEX, 'El teléfono de Pago Móvil', 'Ej: 0412-1234567'),
    },
    transferenciaVes: {
      banco: paymentText('paymentMethods.transferenciaVes.banco', 100, 'El banco de la transferencia'),
      numeroCuenta: paymentPattern(
        'paymentMethods.transferenciaVes.numeroCuenta',
        ACCOUNT_REGEX,
        'El número de cuenta',
        'Debe tener entre 10 y 25 dígitos.',
      ),
      titular: paymentText('paymentMethods.transferenciaVes.titular', 200, 'El titular de la cuenta'),
      rif: paymentPattern('paymentMethods.transferenciaVes.rif', ID_REGEX, 'El RIF del titular', 'Ej: J-12345678-9'),
    },
    zelle: {
      email: paymentPattern('paymentMethods.zelle.email', PAYMENT_EMAIL_REGEX, 'El correo de Zelle', 'Debe ser un email válido.'),
      titular: paymentText('paymentMethods.zelle.titular', 200, 'El titular de Zelle'),
    },
    binance: {
      binanceId: paymentText('paymentMethods.binance.binanceId', 200, 'El Binance Pay ID'),
      walletUsdt: paymentText('paymentMethods.binance.walletUsdt', 100, 'La billetera USDT'),
    },
    swift: {
      banco: paymentText('paymentMethods.swift.banco', 200, 'El banco receptor SWIFT'),
      swift: paymentPattern(
        'paymentMethods.swift.swift',
        SWIFT_REGEX,
        'El código SWIFT/BIC',
        'Debe tener 8 u 11 caracteres, ej: DEUTDEFF.',
      ),
      accountNumber: paymentText('paymentMethods.swift.accountNumber', 100, 'La cuenta internacional'),
      titular: paymentText('paymentMethods.swift.titular', 200, 'El titular internacional'),
    },
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
        internalNotificationsEmail, // null borra explícitamente el valor en la base de datos
        aiProvider,
        ...(aiApiKey !== null ? { aiApiKey } : rawAiApiKey === '' ? { aiApiKey: null } : {}),
        
        aiModel,
        aiAutoSummarize,
        paymentMethods,

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
        paymentMethods,

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
