'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building, CheckCircle2, KeyRound, Link2, Loader2, PlugZap, User, XCircle } from 'lucide-react'

import {
  disconnectConnectionAction,
  pingConnectionAction,
  saveComposioKeyAction,
  startConnectionAction,
  verifyConnectionAction,
  type ConnectionScope,
  type TenantConnectionRow,
} from '@/lib/integration-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const btnPrimary =
  'px-3 py-1.5 bg-white text-black text-[11px] font-bold uppercase tracking-wider font-mono disabled:opacity-40'
const btnGhost =
  'px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] font-bold uppercase tracking-wider font-mono disabled:opacity-40'

interface ToolkitMeta {
  slug: string
  label: string
  hint: string
  enabled: boolean
  /** Soporta "Sincronizar ahora" (espejo/métricas inmediatas). */
  syncable?: boolean
}

/** Conexiones de la empresa: las conecta un admin, las usa todo el tenant. */
const EMPRESA_TOOLKITS: ToolkitMeta[] = [
  { slug: 'instagram', label: 'Instagram', hint: 'Publicar + métricas (Business/Creator)', enabled: true },
  { slug: 'gmail', label: 'Gmail del negocio', hint: 'Buzón compartido (info@…)', enabled: true },
  { slug: 'googlecalendar', label: 'Google Calendar del negocio', hint: 'Calendario de citas de la empresa', enabled: true },
  { slug: 'tiktok', label: 'TikTok', hint: 'Requiere app propia registrada (TIKTOK_CLIENT_ID/SECRET)', enabled: true, syncable: true },
]

/** Conexiones personales: cada usuario conecta su propia cuenta. */
const PERSONAL_TOOLKITS: ToolkitMeta[] = [
  { slug: 'gmail', label: 'Mi Gmail', hint: 'Tu buzón personal — solo tú', enabled: true },
  { slug: 'googlecalendar', label: 'Mi Google Calendar', hint: 'Tu calendario personal — solo tú', enabled: true },
  { slug: 'googlesheets', label: 'Google Sheets', hint: 'Próximamente', enabled: false },
  { slug: 'googledocs', label: 'Google Docs', hint: 'Próximamente', enabled: false },
]

const ESTADO_STYLES: Record<string, string> = {
  ok: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  conectando: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  error_token: 'text-red-400 border-red-500/30 bg-red-500/10',
  error_api: 'text-red-400 border-red-500/30 bg-red-500/10',
  desconectado: 'text-zinc-500 border-zinc-700 bg-zinc-900',
  invalida: 'text-red-400 border-red-500/30 bg-red-500/10',
}

function estadoBadge(estado?: string): { label: string; cls: string } {
  if (!estado) return { label: 'Sin conectar', cls: ESTADO_STYLES.desconectado }
  return { label: estado, cls: ESTADO_STYLES[estado] ?? ESTADO_STYLES.desconectado }
}

/**
 * Abre el link hosted de Composio en un popup y espera el cierre: la página
 * de callback (`/auth/composio/callback`) avisa por postMessage al completar
 * (patrón oficial de la skill de Composio).
 */
function openAuthPopup(url: string, timeoutMs = 300000): Promise<'done' | 'closed'> {
  return new Promise((resolve) => {
    const popup = window.open(url, 'composio-auth-popup', 'width=600,height=840')
    if (!popup) {
      resolve('closed')
      return
    }
    popup.focus()

    const cleanup = () => {
      clearInterval(timer)
      window.removeEventListener('message', onMessage)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data === 'composio-auth-done') {
        cleanup()
        resolve('done')
      }
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup()
        resolve('closed')
      }
    }, 500)
    window.addEventListener('message', onMessage)
    setTimeout(() => {
      cleanup()
      resolve('closed')
    }, timeoutMs)
  })
}

/**
 * Hub de conexiones del tenant con Composio. El proyecto (key + cuota) es del
 * tenant — lo asigna el superadmin o lo aporta el propio tenant. Dos alcances:
 * - "De la empresa": cuentas compartidas del negocio (admin conecta, todos usan).
 * - "Personales": cada usuario conecta su propia cuenta (su Gmail, su calendario).
 */
export function IntegrationHub({
  isAdmin,
  hasApiKey,
  currentUserId,
  rows,
}: {
  isAdmin: boolean
  hasApiKey: boolean
  currentUserId: number
  rows: TenantConnectionRow[]
}) {
  const router = useRouter()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; redirectUrl?: string }>) {
    setBusy(key)
    setMessage(null)
    try {
      const result = await fn()
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error ?? 'Error' })
      } else if (result.redirectUrl) {
        window.location.assign(result.redirectUrl)
        return
      } else {
        setMessage({ kind: 'ok', text: 'Listo' })
      }
      router.refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error inesperado' })
    } finally {
      setBusy(null)
    }
  }

  /** Conectar en un clic: link → popup de login del servicio → auto-verificar. */
  async function handleConnect(slug: string, scope: ConnectionScope) {
    const key = `${scope}:${slug}`
    setBusy(key)
    setMessage(null)
    try {
      const started = await startConnectionAction(slug, scope)
      if (!started.ok || !started.redirectUrl) {
        setMessage({ kind: 'error', text: started.ok ? 'Composio no devolvió link' : started.error })
        return
      }
      const outcome = await openAuthPopup(started.redirectUrl)
      if (outcome === 'done') {
        const verified = await verifyConnectionAction(slug, scope)
        setMessage(
          verified.ok
            ? { kind: 'ok', text: 'Servicio conectado.' }
            : { kind: 'error', text: verified.error ?? 'No se pudo verificar la conexión' },
        )
      } else {
        setMessage({
          kind: 'error',
          text: 'Popup cerrado sin completar el login. Si ya autorizaste, usa "Ya autoricé — verificar".',
        })
      }
      router.refresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Error inesperado' })
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveKey(): Promise<{ ok: boolean; error?: string }> {
    const result = await saveComposioKeyAction(apiKeyInput)
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error })
      return { ok: false, error: result.error }
    }
    setApiKeyInput('')
    setMessage({ kind: 'ok', text: 'Listo: este tenant ahora usa su propio proyecto Composio (cuota propia).' })
    router.refresh()
    return { ok: true }
  }

  function connectionButtons(
    toolkit: ToolkitMeta,
    scope: ConnectionScope,
    row: TenantConnectionRow | undefined,
  ) {
    const key = `${scope}:${toolkit.slug}`
    if (!row || row.estado === 'desconectado' || row.estado === 'error_token') {
      return (
        <button
          type="button"
          className={btnPrimary}
          disabled={busy !== null}
          onClick={() => void handleConnect(toolkit.slug, scope)}
        >
          {busy === key ? (
            <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
          ) : (
            <Link2 size={12} className="inline mr-1" />
          )}
          Conectar
        </button>
      )
    }
    if (row.estado === 'conectando') {
      return (
        <button
          type="button"
          className={btnPrimary}
          disabled={busy !== null}
          onClick={() => void run(key, () => verifyConnectionAction(toolkit.slug, scope))}
        >
          <CheckCircle2 size={12} className="inline mr-1" />
          Ya autoricé — verificar
        </button>
      )
    }
    return (
      <>
        <button
          type="button"
          className={btnGhost}
          disabled={busy !== null}
          onClick={() => void run(key, () => pingConnectionAction(toolkit.slug, scope))}
        >
          Probar
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={busy !== null}
          onClick={() => void run(key, () => disconnectConnectionAction(toolkit.slug, scope))}
        >
          Desconectar
        </button>
      </>
    )
  }

  function card(toolkit: ToolkitMeta, scope: ConnectionScope, row: TenantConnectionRow | undefined) {
    const badge = estadoBadge(row?.estado)
    const canManage = scope === 'empresa' ? isAdmin : true
    return (
      <div key={`${scope}-${toolkit.slug}`} className="border border-zinc-800 bg-black/40 p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-white">
            {toolkit.label}
          </span>
          <span className={`px-2 py-0.5 border text-[9px] font-mono uppercase tracking-wider ${badge.cls}`}>
            {row?.estado === 'ok' ? 'conectado' : badge.label}
          </span>
        </div>
        <span className="text-[10px] text-zinc-500 font-sans normal-case">{toolkit.hint}</span>
        {canManage && toolkit.enabled && (
          <div className="flex flex-wrap gap-2 mt-auto pt-1">
            {connectionButtons(toolkit, scope, row)}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="oled-card p-6" id="conexiones">
      <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
        <PlugZap className="w-4 h-4 text-white" />
        <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
          Conexiones
        </h2>
      </div>

      <p className="mt-4 text-[11px] text-zinc-500 font-sans normal-case">
        Conecta un servicio con un clic: se abre el login del servicio real (Instagram, Google…) en
        un popup y queda cableado. Los tokens viven en Composio; el proyecto (y el consumo) es del
        tenant.
        {hasApiKey
          ? ' Este tenant usa su propio proyecto Composio.'
          : ' Este tenant usa el proyecto gestionado por la plataforma.'}
      </p>

      {message && (
        <div
          className={`mt-3 border px-3 py-2 text-[11px] font-sans normal-case ${
            message.kind === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {message.kind === 'ok' ? (
            <CheckCircle2 size={12} className="inline mr-1" />
          ) : (
            <XCircle size={12} className="inline mr-1" />
          )}
          {message.text}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <Building className="w-3.5 h-3.5 text-zinc-400" />
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
          De la empresa {isAdmin ? '' : '(gestionada por admins)'}
        </h3>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {EMPRESA_TOOLKITS.map((toolkit) =>
          card(
            toolkit,
            'empresa',
            rows.find((row) => row.scope === 'empresa' && row.toolkit === toolkit.slug),
          ),
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <User className="w-3.5 h-3.5 text-zinc-400" />
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Personales (solo tuyas)</h3>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {PERSONAL_TOOLKITS.map((toolkit) =>
          card(
            toolkit,
            'personal',
            rows.find((row) => row.scope === 'personal' && row.toolkit === toolkit.slug && row.userId === currentUserId),
          ),
        )}
      </div>

      {isAdmin && (
        <div className="mt-5 border border-zinc-800 bg-black/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              API key de este tenant (opcional — BYO)
            </span>
            {hasApiKey && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-emerald-400">
                <CheckCircle2 size={12} /> activa (cifrada)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="API key de platform.composio.dev — solo si el tenant quiere cuota propia"
              className={inputCls}
            />
            <button
              type="button"
              className={btnPrimary}
              disabled={busy === 'key' || !apiKeyInput.trim()}
              onClick={() => void run('key', handleSaveKey)}
            >
              {busy === 'key' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Usar'}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600 font-sans normal-case">
            Por defecto las conexiones usan la cuota del proyecto asignado al tenant. Si se pega aquí
            una key propia, este tenant consume SU cuota. El superadmin también puede asignarla por
            tenant desde /admin → Integraciones del Tenant. Cifrada con AES-256-GCM; no vuelve a mostrarse.
          </p>
        </div>
      )}
    </section>
  )
}
