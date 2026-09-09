'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Link2, Loader2, PlugZap, XCircle } from 'lucide-react'

import {
  disconnectConnectionAction,
  pingConnectionAction,
  saveComposioKeyAction,
  startConnectionAction,
  verifyConnectionAction,
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
}

const TOOLKITS: ToolkitMeta[] = [
  { slug: 'instagram', label: 'Instagram', hint: 'Publicar + métricas (Business/Creator)', enabled: true },
  { slug: 'tiktok', label: 'TikTok', hint: 'Próximamente — requiere app propia de TikTok', enabled: false },
  { slug: 'gmail', label: 'Gmail', hint: 'Próximamente — espejo de correo', enabled: false },
  { slug: 'googlecalendar', label: 'Google Calendar', hint: 'Próximamente — espejo de citas', enabled: false },
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
 * Hub de conexiones del tenant con Composio (BYO-key): la API key del
 * proyecto se guarda cifrada una vez; cada toolkit se conecta con login
 * hosted (el usuario loguea en el servicio real, nunca en Composio).
 * Los datos los trae el server component; tras cada acción se re-renderiza
 * vía router.refresh().
 */
export function IntegrationHub({
  isAdmin,
  hasApiKey,
  rows,
}: {
  isAdmin: boolean
  hasApiKey: boolean
  rows: TenantConnectionRow[]
}) {
  const router = useRouter()
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function rowFor(slug: string): TenantConnectionRow | undefined {
    return rows.find((row) => row.toolkit === slug)
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; redirectUrl?: string }>) {
    setBusy(key)
    setMessage(null)
    try {
      const result = await fn()
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error ?? 'Error' })
      } else if (result.redirectUrl) {
        window.location.href = result.redirectUrl
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

  async function handleSaveKey(): Promise<{ ok: boolean; error?: string }> {
    const result = await saveComposioKeyAction(apiKeyInput)
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error })
      return { ok: false, error: result.error }
    }
    setApiKeyInput('')
    setMessage({ kind: 'ok', text: 'API key guardada (cifrada). Ya puedes conectar servicios.' })
    router.refresh()
    return { ok: true }
  }

  return (
    <section className="oled-card p-6" id="conexiones">
      <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
        <PlugZap className="w-4 h-4 text-white" />
        <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
          Conexiones (Composio)
        </h2>
      </div>

      <p className="mt-4 text-[11px] text-zinc-500 font-sans normal-case">
        Cada servicio se conecta con tu login (Instagram, Google…). Los tokens viven en Composio;
        aquí solo queda la referencia.
      </p>

      {isAdmin && (
        <div className="mt-4 border border-zinc-800 bg-black/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              API key de tu proyecto Composio
            </span>
            {hasApiKey && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-emerald-400">
                <CheckCircle2 size={12} /> guardada (cifrada)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder={hasApiKey ? 'Dejar igual o pegar una nueva para rotar' : 'key de platform.composio.dev'}
              className={inputCls}
            />
            <button
              type="button"
              className={btnPrimary}
              disabled={busy === 'key' || !apiKeyInput.trim()}
              onClick={() => void run('key', handleSaveKey)}
            >
              {busy === 'key' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600 font-sans normal-case">
            Se cifra con AES-256-GCM y no vuelve a mostrarse. Créala en platform.composio.dev → API Keys.
          </p>
        </div>
      )}

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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {TOOLKITS.map((toolkit) => {
          const row = rowFor(toolkit.slug)
          const badge = estadoBadge(row?.estado)
          return (
            <div key={toolkit.slug} className="border border-zinc-800 bg-black/40 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-white">
                  {toolkit.label}
                </span>
                <span className={`px-2 py-0.5 border text-[9px] font-mono uppercase tracking-wider ${badge.cls}`}>
                  {row?.estado === 'ok' ? 'conectado' : badge.label}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-sans normal-case">{toolkit.hint}</span>
              {isAdmin && toolkit.enabled && (
                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  {!row || row.estado === 'desconectado' || row.estado === 'error_token' ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy !== null || !hasApiKey}
                      onClick={() => void run(toolkit.slug, () => startConnectionAction(toolkit.slug))}
                    >
                      <Link2 size={12} className="inline mr-1" /> Conectar
                    </button>
                  ) : row.estado === 'conectando' ? (
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy !== null}
                      onClick={() => void run(toolkit.slug, () => verifyConnectionAction(toolkit.slug))}
                    >
                      {busy === toolkit.slug ? (
                        <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      ) : (
                        <CheckCircle2 size={12} className="inline mr-1" />
                      )}
                      Ya autoricé — verificar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy !== null}
                        onClick={() => void run(toolkit.slug, () => pingConnectionAction(toolkit.slug))}
                      >
                        Probar
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy !== null}
                        onClick={() => void run(toolkit.slug, () => disconnectConnectionAction(toolkit.slug))}
                      >
                        Desconectar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
