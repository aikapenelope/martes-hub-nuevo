'use client'

/**
 * error.tsx — límite de error compartido para `/workspace` y rutas
 * anidadas. Next.js requiere que sea un Client Component. No se envía a
 * ningún servicio externo (README descarta Sentry deliberadamente); queda
 * en consola para depuración local y muestra un estado recuperable en vez
 * del overlay de error sin estilo de Next.
 */

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[workspace]', error)
  }, [error])

  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-3 border border-red-900/50 bg-zinc-950 px-6 py-12 text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center border border-red-900 bg-zinc-900 text-red-400">
        <AlertTriangle size={18} />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">
        Algo falló al cargar esta vista
      </h2>
      <p className="max-w-md text-xs text-zinc-400">
        {error.digest
          ? `Ocurrió un error inesperado (ref. ${error.digest}). Intenta de nuevo.`
          : 'Ocurrió un error inesperado. Intenta de nuevo o vuelve al resumen.'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="px-3.5 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono transition hover:bg-zinc-200"
        >
          Reintentar
        </button>
        <a
          href="/workspace"
          className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono transition"
        >
          Ir al resumen
        </a>
      </div>
    </section>
  )
}
