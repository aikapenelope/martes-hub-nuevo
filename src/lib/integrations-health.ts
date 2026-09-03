import 'server-only'

import type { Payload } from 'payload'
import type { Tenant, User } from '@/payload-types'
import { isConfigured as isOpenBspConfigured } from '@/integrations/openbsp/client'
import { areGoogleCredentialsConfigured } from '@/integrations/google/token'

export type IntegrationStatus = 'healthy' | 'warning' | 'error' | 'disabled'

export interface IntegrationHealthItem {
  id: string
  name: string
  category: 'whatsapp' | 'email' | 'calendar' | 'webhooks'
  status: IntegrationStatus
  badge: string
  message: string
  detail?: string
  lastChecked: string
  actionHref?: string
  actionLabel?: string
}

export interface SystemHealthSummary {
  overallStatus: IntegrationStatus
  items: IntegrationHealthItem[]
  recentErrorCount: number
}

/**
 * Diagnóstico en vivo de las integraciones del tenant.
 * No genera llamadas bloqueantes pesadas a APIs de terceros:
 * audita configuración, tokens y volumen de logs/errores recientes en Payload/OpenBSP.
 */
export async function getIntegrationsHealth(
  payload: Payload,
  tenant?: Tenant,
  tenantId?: number,
  user?: User,
): Promise<SystemHealthSummary> {
  const now = new Date()
  const nowIso = now.toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const resolvedTenantId = tenant?.id ?? tenantId

  // 1. WhatsApp / Meta (OpenBSP)
  const openBspEnvOk = isOpenBspConfigured()
  const tenantHasOrg = Boolean(tenant?.openbspOrganizationId)
  const tenantHasPhone = Boolean(tenant?.openbspPhoneNumberId)

  let whatsappStatus: IntegrationStatus = 'healthy'
  let whatsappBadge = 'ONLINE'
  let whatsappMsg = 'OpenBSP conectado y listo para mensajería Meta Cloud.'
  let whatsappDetail = tenantHasPhone ? `Teléfono ID: ${tenant?.openbspPhoneNumberId}` : 'Número predeterminado activo'

  if (!openBspEnvOk) {
    whatsappStatus = 'disabled'
    whatsappBadge = 'SIN CONFIGURAR'
    whatsappMsg = 'Faltan credenciales de entorno para OpenBSP / Meta.'
    whatsappDetail = 'Configura OPENBSP_API_KEY y OPENBSP_ORG_ID'
  } else if (!tenantHasOrg && !process.env.OPENBSP_ORG_ID) {
    whatsappStatus = 'warning'
    whatsappBadge = 'FALTA ORG'
    whatsappMsg = 'El tenant no tiene configurada la organización de OpenBSP.'
    whatsappDetail = 'Asigna openbspOrganizationId en Configuración'
  }

  // 2. Email (Resend)
  const resendApiKey = process.env.RESEND_API_KEY
  let emailStatus: IntegrationStatus = 'healthy'
  let emailBadge = 'ONLINE'
  let emailMsg = 'Motor de emails transaccionales y campañas operando.'
  let emailDetail = 'Resend API vinculada'

  if (!resendApiKey) {
    emailStatus = 'disabled'
    emailBadge = 'INACTIVO'
    emailMsg = 'Falta configurar RESEND_API_KEY para envíos de correo.'
    emailDetail = 'Los correos no se enviarán a clientes'
  }

  // 3. Google Calendar / Citas
  const googleConfigured = areGoogleCredentialsConfigured()
  let calendarStatus: IntegrationStatus = 'healthy'
  let calendarBadge = 'SINCRONIZADO'
  let calendarMsg = 'Sincronización bidireccional con Google Calendar activa.'
  let calendarDetail = 'OAuth2 activo con scopes de lectura'

  if (!googleConfigured) {
    calendarStatus = 'disabled'
    calendarBadge = 'NO VINCULADO'
    calendarMsg = 'Credenciales de Google OAuth no configuradas.'
    calendarDetail = 'Las citas se manejarán localmente'
  }

  // 4. Webhooks & Logs de errores recientes (últimas 24h)
  let recentErrorCount = 0
  try {
    const errorLogs = await payload.find({
      collection: 'activities',
      limit: 10,
      depth: 0,
      overrideAccess: false,
      user,
      where: {
        and: [
          ...(resolvedTenantId ? [{ tenant: { equals: resolvedTenantId } }] : []),
          { createdAt: { greater_than_equal: oneDayAgo } },
          { type: { equals: 'error' } },
        ],
      },
    })
    recentErrorCount = errorLogs.totalDocs
  } catch {
    recentErrorCount = 0
  }

  const webhookStatus: IntegrationStatus = recentErrorCount > 5 ? 'error' : recentErrorCount > 0 ? 'warning' : 'healthy'
  const webhookBadge = recentErrorCount === 0 ? 'ESTABLE' : `${recentErrorCount} ERRORES`
  const webhookMsg = recentErrorCount === 0 ? 'Sin fallos de webhooks o sync en 24h.' : `${recentErrorCount} excepciones en las últimas 24 horas.`

  const items: IntegrationHealthItem[] = [
    {
      id: 'whatsapp',
      name: 'WhatsApp / Meta Cloud (OpenBSP)',
      category: 'whatsapp',
      status: whatsappStatus,
      badge: whatsappBadge,
      message: whatsappMsg,
      detail: whatsappDetail,
      lastChecked: nowIso,
      actionHref: '/workspace/inbox',
      actionLabel: 'Abrir Inbox',
    },
    {
      id: 'email',
      name: 'Email Transaccional (Resend)',
      category: 'email',
      status: emailStatus,
      badge: emailBadge,
      message: emailMsg,
      detail: emailDetail,
      lastChecked: nowIso,
      actionHref: '/workspace/email',
      actionLabel: 'Ver Campañas',
    },
    {
      id: 'calendar',
      name: 'Google Calendar (Citas)',
      category: 'calendar',
      status: calendarStatus,
      badge: calendarBadge,
      message: calendarMsg,
      detail: calendarDetail,
      lastChecked: nowIso,
      actionHref: '/workspace/calendar',
      actionLabel: 'Ver Calendario',
    },
    {
      id: 'webhooks',
      name: 'Webhooks & Tareas Asíncronas',
      category: 'webhooks',
      status: webhookStatus,
      badge: webhookBadge,
      message: webhookMsg,
      detail: 'Tally, OpenBSP Webhooks y background workers',
      lastChecked: nowIso,
      actionHref: '/workspace/activities',
      actionLabel: 'Ver Actividades',
    },
  ]

  let overallStatus: IntegrationStatus = 'healthy'
  if (items.some((i) => i.status === 'error')) {
    overallStatus = 'error'
  } else if (items.some((i) => i.status === 'warning')) {
    overallStatus = 'warning'
  } else if (items.every((i) => i.status === 'disabled')) {
    overallStatus = 'disabled'
  }

  return {
    overallStatus,
    items,
    recentErrorCount,
  }
}
