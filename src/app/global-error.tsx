'use client'

/**
 * global-error.tsx — límite de error global de Next.js App Router.
 * Captura cualquier excepción que ocurra dentro de los root layouts
 * y renderiza un estado recuperable con la estética OLED de Martes Hub.
 */
export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full border border-zinc-800 bg-[#08080a] p-6 text-center shadow-2xl">
          <div className="mb-3 inline-flex size-10 items-center justify-center border border-red-900 bg-red-950/40 text-red-400 font-mono font-bold">
            !
          </div>
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white mb-2">
            Error al cargar la aplicación
          </h2>
          <p className="text-xs text-zinc-400 mb-5">
            Ocurrió una excepción inesperada durante la carga. Puedes intentar recargar la vista o volver a iniciar sesión.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 bg-white text-black font-mono text-xs font-bold uppercase tracking-wider hover:bg-zinc-200 transition"
            >
              Reintentar
            </button>
            <a
              href="/workspace"
              className="px-4 py-2 border border-zinc-700 bg-zinc-900 text-white font-mono text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 transition"
            >
              Ir a Inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
