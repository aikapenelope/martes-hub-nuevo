import { CheckCircle2, XCircle } from 'lucide-react'

/**
 * Callback de los links hosted de Composio (popup pattern): Composio
 * redirige aquí con `?status=success&connectedAccountId=…` o `?error=…`.
 * Muestra el resultado, avisa a la ventana padre y se cierra sola.
 *
 * Fuera del grupo (workspace) a propósito: el popup no debe llevar el shell
 * del workspace ni su gate de layout.
 */
export default async function ComposioCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; connectedAccountId?: string; error?: string }>
}) {
  const { status, connectedAccountId, error } = await searchParams
  const ok = status === 'success' && Boolean(connectedAccountId)

  const autoClose = `
    setTimeout(function () { window.close() }, 1200)
    try { window.opener && window.opener.postMessage('composio-auth-done', window.location.origin) } catch (e) {}
  `

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-8 text-center">
      {ok ? (
        <>
          <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          <h1 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
            Conexión completada
          </h1>
          <p className="text-xs text-zinc-400">
            El servicio quedó autorizado. Esta ventana se cierra sola.
          </p>
        </>
      ) : (
        <>
          <XCircle className="h-10 w-10 text-red-400" />
          <h1 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
            La conexión no se completó
          </h1>
          <p className="text-xs text-zinc-400">
            {error ? `Composio reportó: ${error}` : 'No recibimos la confirmación del servicio.'}
          </p>
          <p className="text-[11px] text-zinc-500">
            Cierra esta ventana y usa «Ya autoricé — verificar» en Ajustes.
          </p>
        </>
      )}
      <noscript>
        <a href="/workspace/settings" className="text-xs text-zinc-300 underline">
          Volver a Ajustes
        </a>
      </noscript>
      <script dangerouslySetInnerHTML={{ __html: autoClose }} />
    </main>
  )
}
