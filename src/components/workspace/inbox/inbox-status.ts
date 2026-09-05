export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

/**
 * Normaliza los estados persistidos de OpenBSP / Meta Webhooks y el estado local de envío.
 * Soporta las claves canónicas de webhook: accepted, sent, delivered, read, failed, errors,
 * así como los campos locales dispatchStatus, error y el prefijo 'pending:' en openbspId.
 */
export function normalizeDeliveryStatus(
  statusJson?: Record<string, unknown> | null,
  openbspId?: string | null,
): MessageDeliveryStatus {
  if (!statusJson && !openbspId) return 'sent'

  // 1. Estados de fallo / error
  const hasErrors = Boolean(
    statusJson?.errors &&
      (Array.isArray(statusJson.errors)
        ? statusJson.errors.length > 0
        : typeof statusJson.errors === 'object'),
  )

  const isExplicitFailed =
    statusJson?.dispatchStatus === 'failed' ||
    statusJson?.status === 'failed' ||
    statusJson?.failed === true ||
    Boolean(statusJson?.failed_at) ||
    Boolean(statusJson?.error) ||
    hasErrors

  if (isExplicitFailed) {
    return 'failed'
  }

  // 2. Estado de lectura (read takes precedence over delivered/sent)
  if (
    statusJson?.status === 'read' ||
    statusJson?.read === true ||
    Boolean(statusJson?.read_at)
  ) {
    return 'read'
  }

  // 3. Estado de entrega (delivered takes precedence over sent)
  if (
    statusJson?.status === 'delivered' ||
    statusJson?.delivered === true ||
    Boolean(statusJson?.delivered_at)
  ) {
    return 'delivered'
  }

  // 4. Estado pendiente (enviando...)
  const isPendingId = typeof openbspId === 'string' && openbspId.startsWith('pending:')
  if (
    statusJson?.dispatchStatus === 'pending' ||
    statusJson?.status === 'pending' ||
    (isPendingId &&
      statusJson?.dispatchStatus !== 'dispatched' &&
      statusJson?.status !== 'accepted' &&
      statusJson?.status !== 'sent')
  ) {
    return 'pending'
  }

  // 5. Estado enviado / aceptado / despachado por defecto
  return 'sent'
}

/**
 * Extrae de forma segura el mensaje de error legible para el usuario o tooltip.
 */
export function getErrorMessage(statusJson?: Record<string, unknown> | null): string {
  if (!statusJson) return 'Error en el envío'

  if (typeof statusJson.error === 'string' && statusJson.error.trim().length > 0) {
    return statusJson.error.trim()
  }

  if (typeof statusJson.error === 'object' && statusJson.error !== null) {
    const errObj = statusJson.error as Record<string, unknown>
    if (typeof errObj.message === 'string' && errObj.message.trim().length > 0) {
      return errObj.message.trim()
    }
  }

  if (Array.isArray(statusJson.errors) && statusJson.errors.length > 0) {
    const first = statusJson.errors[0]
    if (typeof first === 'string' && first.trim().length > 0) {
      return first.trim()
    }
    if (typeof first === 'object' && first !== null) {
      const errObj = first as Record<string, unknown>
      if (typeof errObj.message === 'string' && errObj.message.trim().length > 0) {
        return errObj.message.trim()
      }
    }
  }

  return 'Error en el envío'
}
