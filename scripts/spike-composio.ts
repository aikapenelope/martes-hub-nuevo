/**
 * Spike Fase 0 — valida el flujo completo de Composio con una cuenta real:
 *   1. auth config gestionado del toolkit (get-or-create)
 *   2. Connect Link (el usuario loguea en el servicio real)
 *   3. verificación filtrada por auth config
 *   4. ejecución determinista de una acción de lectura
 *
 * Uso:
 *   INTEGRATIONS_ENC_KEY=dev COMPOSIO_API_KEY=key pnpm tsx scripts/spike-composio.ts instagram
 *
 * No toca la BD de Payload: usa la key del env directo. Si el toolkit no tiene
 * managed auth (ej. tiktok), este spike NO aplica — documentar el error.
 */
import { Composio } from '@composio/core'

const toolkit = process.argv[2] ?? 'instagram'
const apiKey = process.env.COMPOSIO_API_KEY

if (!apiKey) {
  console.error('Uso: COMPOSIO_API_KEY=<key> pnpm tsx scripts/spike-composio.ts <instagram|gmail|googlecalendar>')
  process.exit(1)
}

const userId = 'martes-hub:spike'

async function main(): Promise<void> {
  const composio = new Composio({ apiKey })
  console.log(`[1/4] toolkit="${toolkit}" userId="${userId}"`)

  console.log('[2/4] get-or-create auth config gestionado…')
  const existing = await composio.authConfigs.list({ toolkit, isComposioManaged: true })
  let authConfigId = existing.items?.find((config) => config.toolkit?.slug === toolkit)?.id
  if (authConfigId) {
    console.log(`   ya existe: ${authConfigId}`)
  } else {
    const created = await composio.authConfigs.create(toolkit, {
      type: 'use_composio_managed_auth',
      name: `Spike ${toolkit}`,
    })
    authConfigId = created.id
    console.log(`   creado: ${authConfigId}`)
  }

  console.log('[3/4] creando Connect Link…')
  const link = await composio.connectedAccounts.link(userId, authConfigId, {
    callbackUrl: 'http://localhost:3000/workspace/settings',
  })
  console.log(`   abre este URL y autoriza: ${link.redirectUrl}`)
  console.log('   esperando conexión (Ctrl+C para abortar)…')
  const account = await link.waitForConnection()
  console.log(`   conectado: ${account.id} (${account.status})`)

  console.log('[4/4] verificación filtrada + ejecución determinista…')
  const listed = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkit],
    authConfigIds: [authConfigId],
  })
  const active = (listed.items ?? []).find((item) => item.id === account.id)
  console.log(`   verificado: ${active ? 'OK' : 'NO ENCONTRADO'}`)

  const info = await composio.toolkits.get(toolkit)
  const version = info.meta?.availableVersions?.[0]
  console.log(`   versión del toolkit: ${version ?? '(sin versiones publicadas)'}`)
  if (!version) throw new Error('Sin versión disponible para ejecutar')

  const readSlugs: Record<string, string> = {
    instagram: 'INSTAGRAM_GET_USER_INFO',
    gmail: 'GMAIL_LIST_LABELS',
    googlecalendar: 'GOOGLE_CALENDAR_LIST_CALENDARS',
  }
  const slug = readSlugs[toolkit]
  if (!slug) {
    console.log(`   sin acción de lectura mapeada para "${toolkit}" — spike de conexión completo`)
    return
  }
  const result = await composio.tools.execute(slug, { userId, arguments: {}, version })
  console.log(`   ${slug} →`, JSON.stringify(result).slice(0, 400))
  console.log('\n✅ Spike completo: conexión + ejecución funcionan con la app gestionada.')
}

main().catch((error) => {
  console.error('\n❌ Spike falló — error crudo de Composio (sin fallback):')
  console.error(error)
  process.exit(1)
})
