/**
 * Helpers puros de la integración Composio — sin `import 'server-only'` para
 * que los tests los importen directo (mismo criterio que
 * `crm-pipeline-window.ts`). El cliente SDK vive en `client.ts`.
 */

export const COMPOSIO_USER_PREFIX = 'martes-hub'

/**
 * userId externo en Composio, aislado por alcance (patrón "prefixed DB id" de
 * la doc oficial):
 * - Empresa (compartida): `martes-hub:{tenantId}` — la conecta un admin y la
 *   usa todo el tenant.
 * - Personal de un usuario: `martes-hub:{tenantId}:u:{userId}` — cada quien
 *   conecta su propia cuenta y queda aislada de los demás.
 * La key del proyecto (y por tanto el consumo) es del tenant en ambos casos.
 */
export function composioTenantUserId(tenantId: number): string {
  return `${COMPOSIO_USER_PREFIX}:${tenantId}`
}

export function composioUserUserId(tenantId: number, userId: number): string {
  return `${COMPOSIO_USER_PREFIX}:${tenantId}:u:${userId}`
}

/** Toolkits con managed auth disponibles para el hub de conexiones (v1: Instagram). */
export const MANAGED_TOOLKITS = ['instagram', 'gmail', 'googlecalendar', 'googlesheets', 'googledocs'] as const

/** Toolkits que requieren auth config custom (app propia registrada). */
export const CUSTOM_AUTH_TOOLKITS = ['tiktok'] as const

export type SupportedToolkit = (typeof MANAGED_TOOLKITS)[number] | (typeof CUSTOM_AUTH_TOOLKITS)[number]

export function isSupportedToolkit(value: string): value is SupportedToolkit {
  return (MANAGED_TOOLKITS as readonly string[]).includes(value) || (CUSTOM_AUTH_TOOLKITS as readonly string[]).includes(value)
}

/** Forma mínima de un connected account de Composio para filtrar sin acoplarnos al SDK. */
export interface ComposioConnectedAccountRef {
  id: string
  authConfigId?: string | null
  toolkit?: string | { slug?: string | null } | null
  status?: string | null
}

function toolkitSlug(toolkit: ComposioConnectedAccountRef['toolkit']): string | null {
  if (!toolkit) return null
  return typeof toolkit === 'string' ? toolkit : (toolkit.slug ?? null)
}

/**
 * Selección determinista del connected account de una conexión: debe coincidir
 * con el authConfigId Y el toolkit pedidos (varios toolkits comparten el mismo
 * userId — listar todo el userId puede traer cuentas ajenas; fix de review).
 * Devuelve el único activo o null.
 */
export function filterConnectedAccounts(
  accounts: ComposioConnectedAccountRef[],
  expected: { authConfigId: string; toolkit: string },
): ComposioConnectedAccountRef | null {
  const matches = accounts.filter(
    (account) =>
      account.authConfigId === expected.authConfigId &&
      toolkitSlug(account.toolkit) === expected.toolkit &&
      (!account.status || account.status.toUpperCase() === 'ACTIVE'),
  )
  if (matches.length === 0) return null
  // El más reciente gana (Composio devuelve created_at asc con orderBy default).
  return matches[matches.length - 1]!
}
