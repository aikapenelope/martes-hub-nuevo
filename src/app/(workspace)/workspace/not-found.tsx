/**
 * not-found.tsx — pantalla compartida para `/workspace` y rutas anidadas
 * cuando una página llama a `notFound()` (p. ej. ficha de lead/cliente o
 * tarea inexistente en `crm/[type]/[id]` y `tasks/[id]`) o cuando la ruta
 * no existe dentro de este segmento.
 */

import Link from 'next/link'
import { SearchX } from 'lucide-react'

export default function WorkspaceNotFound() {
  return (
    <section className="flex flex-col items-center gap-3 border border-zinc-800 bg-zinc-950 px-6 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-400">
        <SearchX size={18} />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">No encontramos esto</h2>
      <p className="max-w-md text-xs text-zinc-400">
        El registro que buscas no existe, fue eliminado, o no pertenece a tu tenant.
      </p>
      <Link
        href="/workspace"
        className="px-3.5 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono transition hover:bg-zinc-200"
      >
        Ir al resumen
      </Link>
    </section>
  )
}
